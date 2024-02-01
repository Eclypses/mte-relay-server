import {
  FastifyRequest,
  FastifyInstance,
  FastifyReply,
  HTTPMethods,
} from "fastify";
import { Readable } from "stream";
import { decode, encode } from "./mte";
import { cloneHeaders, makeHeaderAString } from "../utils/header-utils";
import { MteRelayError } from "./mte/errors";
import mteIdManager from "./mte-id-manager";
import { RelayOptions, formatMteRelayHeader } from "../utils/mte-relay-header";

function proxyHandler(
  fastify: FastifyInstance,
  options: {
    upstream: string;
    httpMethods: string[];
    routes?: string[];
    tempDirPath: string;
    outboundToken?: string;
    mteRelayHeader: string;
    encodedHeadersHeader: string;
    clientIdSecret: string;
  },
  done: any
) {
  // register MTE ID Manager
  fastify.register(mteIdManager, {
    mteRelayHeader: options.mteRelayHeader,
    clientIdSecret: options.clientIdSecret,
  });

  // log mte usage
  fastify.addHook("onRequest", async (request, reply) => {
    if (!request.relayOptions.clientId) {
      request.log.error(`Missing clientID header.`);
      return reply.status(401).send("Unauthorized");
    }
    if (!request.relayOptions.pairId) {
      const err = new MteRelayError("PairID is required, but not found.");
      request.log.error(err.message);
      return reply.status(err.status).send(err.message);
    }
    request.log.info(
      {
        ClientId: request.relayOptions.clientId,
        url: request.url,
        encoderType: request.relayOptions.encodeType,
      },
      `MTE Proxy Route used: ${request.url}`
    );
    const mteRelayHeader = request.headers[options.mteRelayHeader] as string;
    reply.header(options.mteRelayHeader, mteRelayHeader);
  });

  // for all content-types, forward incoming stream
  fastify.addContentTypeParser("*", function (_request, payload, done) {
    return done(null, payload);
  });

  // remove OPTIONS from httpMethods, they are not needed for server-to-server proxy
  const disallowedMethods = ["OPTIONS", "HEAD"];
  const methods = options.httpMethods.filter(
    (method) => !disallowedMethods.includes(method)
  );

  // support white-listed MTE routes, or default all routes to MTE proxy
  if (options.routes) {
    options.routes.forEach((route) => {
      fastify.all(route, handler);
    });
  } else {
    fastify.route({
      method: methods as HTTPMethods[],
      url: "*",
      handler: handler,
    });
  }

  // handler function
  async function handler(request: FastifyRequest, reply: FastifyReply) {
    try {
      // determine if authorized outbound-proxy, or if inbound-proxy
      if (options.outboundToken) {
        // get bearer token from request
        const bearerToken = request.headers.authorization?.split(" ")[1];
        if (bearerToken && bearerToken !== options.outboundToken) {
          return reply.status(401).send("Unauthorized");
        }
      }

      const itemsToDecode: {
        data: string | Uint8Array;
        output: "str" | "Uint8Array";
      }[] = [];

      // get route to decode
      if (request.relayOptions.urlIsEncoded) {
        const uriDecodeUrl = decodeURIComponent(request.url.slice(1));
        if (uriDecodeUrl.length > 0) {
          itemsToDecode.push({ data: uriDecodeUrl, output: "str" });
        }
      }

      // decoded headers
      if (request.relayOptions.headersAreEncoded) {
        const encodedHeaders = request.headers[
          options.encodedHeadersHeader
        ] as string;
        if (encodedHeaders) {
          itemsToDecode.push({ data: encodedHeaders, output: "str" });
        }
      }

      // encode body
      if (request.relayOptions.bodyIsEncoded && request.body) {
        const u8 = await streamToUint8Array(
          request.body as unknown as Readable
        );
        itemsToDecode.push({ data: u8, output: "Uint8Array" });
      }

      // decode items
      const result = await decode({
        id: `decoder.${request.relayOptions.clientId}.${request.relayOptions.pairId}`,
        items: itemsToDecode,
        type: request.relayOptions.encodeType!,
      });

      // create new request url
      let decryptedUrl = request.url.slice(1);
      if (request.relayOptions.urlIsEncoded) {
        decryptedUrl = result[0] as string;
        result.shift();
      }

      // create new headers
      delete request.headers[options.mteRelayHeader];
      delete request.headers["content-length"];
      delete request.headers["transfer-encoding"];
      delete request.headers["content-type"];
      delete request.headers["Content-Type"];
      delete request.headers[options.encodedHeadersHeader];
      delete request.headers["host"];
      delete request.headers["cache-control"];
      const proxyHeaders = cloneHeaders(request.headers);
      proxyHeaders.host = options.upstream.replace(/https?:\/\//, "");
      proxyHeaders["cache-control"] = "no-cache";

      // decode headers, if present
      let decodedHeaders: Record<string, string> = {};
      if (request.relayOptions.headersAreEncoded) {
        decodedHeaders = JSON.parse(result[0] as string);
        Object.entries(decodedHeaders).forEach(([key, value]) => {
          proxyHeaders[key] = value as string;
        });
        request.log.debug(
          `Decoded Headers:\n${JSON.stringify(decodedHeaders)}`
        );
        result.shift();
      }

      // decode payload, if present
      let proxyPayload = request.body;
      if (request.relayOptions.bodyIsEncoded) {
        proxyPayload = result[0];
        request.log.debug(`Decoded Payload:\n${proxyPayload}`);
      }

      // make new request
      let proxyResponse: void | Response = void 0;
      try {
        proxyResponse = await fetch(options.upstream + "/" + decryptedUrl, {
          method: request.method,
          headers: proxyHeaders,
          body: proxyPayload as any,
        });
      } catch (error: any) {
        request.log.error(error);
        const headers = error.response?.headers;
        if (headers) {
          delete headers["access-control-allow-origin"];
          reply.headers(headers);
        }
        const status = error.response?.status;
        const body = error.response?.data;
        if (status) {
          return reply.status(status).send(body || undefined);
        }
        let message = "Unknown error";
        if (error.message) {
          message = error.message;
        }
        return reply.status(500).send(message);
      }

      if (!proxyResponse) {
        return reply.status(500).send("No Response.");
      }

      request.log.debug(
        `Proxy Response Headers - Original:\n${proxyResponse.headers}`
      );

      // @ts-ignore
      const responseHeaders = cloneHeaders(proxyResponse.headers);

      // create response headers
      const methods = proxyResponse.headers.get("access-control-allow-methods");
      if (methods) {
        responseHeaders["access-control-allow-methods"] = methods;
      }

      // merge these headers with upstream server headers, if present
      responseHeaders["access-control-allow-headers"] = (() => {
        let value: string[] = [];
        const replyHeader = reply.getHeader("access-control-allow-headers");
        if (replyHeader) {
          value.push(makeHeaderAString(replyHeader));
        }
        const proxyResponseHeader = proxyResponse.headers.get(
          "access-control-allow-headers"
        );
        if (proxyResponseHeader) {
          value.push(makeHeaderAString(proxyResponseHeader));
        }
        return value.join(", ");
      })();
      responseHeaders["access-control-expose-headers"] = (() => {
        let value: string[] = [];
        const replyHeader = reply.getHeader("access-control-expose-headers");
        if (replyHeader) {
          value.push(makeHeaderAString(replyHeader));
        }
        const proxyResponseHeader = proxyResponse.headers.get(
          "access-control-expose-headers"
        );
        if (proxyResponseHeader) {
          value.push(makeHeaderAString(proxyResponseHeader));
        }
        return value.join(", ");
      })();
      delete responseHeaders["content-length"];
      delete responseHeaders["transfer-encoding"];
      delete responseHeaders["access-control-allow-origin"];
      responseHeaders[options.encodedHeadersHeader];

      // copy cookies
      const setCookie = proxyResponse.headers.get("set-cookie");
      if (setCookie) {
        responseHeaders["set-cookie"] = setCookie;
      }

      request.log.debug(
        `Proxy Response Headers - Modified:\n${proxyResponse.headers}`
      );

      // collect data to be encoded
      const itemsToEncode: {
        data: string | Uint8Array;
        output: "B64" | "Uint8Array";
      }[] = [];

      // collect Headers to encode
      const headersToEncode: Record<string, string> = {};
      Object.keys(decodedHeaders).forEach((key) => {
        const value = proxyResponse?.headers.get(key);
        if (value) {
          headersToEncode[key] = value;
        }
      });
      const contentTypeHeader = proxyResponse.headers.get("content-type");
      if (contentTypeHeader) {
        headersToEncode["content-type"] = contentTypeHeader;
      }
      const hasEncodedHeaders = Object.keys(headersToEncode).length > 0;
      if (hasEncodedHeaders) {
        const encodedHeadersJson = JSON.stringify(headersToEncode);
        itemsToEncode.push({ data: encodedHeadersJson, output: "B64" });
      }

      // get body to encode
      const _body = await proxyResponse.arrayBuffer();
      const hasEncodedBody = _body.byteLength > 0;
      if (hasEncodedBody) {
        itemsToEncode.push({
          data: new Uint8Array(_body),
          output: "Uint8Array",
        });
      }

      // encode response
      const results = await encode({
        id: `encoder.${request.relayOptions.clientId}.${request.relayOptions.pairId}`,
        items: itemsToEncode,
        type: request.relayOptions.encodeType!,
      });

      // attached encoded headers to response
      if (hasEncodedHeaders) {
        responseHeaders[options.encodedHeadersHeader] = results[0] as string;
        results.shift();
      }

      let payload: any = undefined;

      // if body is encoded, update payload
      if (hasEncodedBody) {
        payload = results[0];
        responseHeaders["content-type"] = "application/octet-stream";
        responseHeaders["content-length"] = payload.length.toString();
      }

      // set relay options header
      const responseRelayOptions: RelayOptions = {
        clientId: request.clientIdSigned,
        pairId: request.relayOptions.pairId,
        encodeType: request.relayOptions.encodeType,
        urlIsEncoded: false,
        headersAreEncoded: hasEncodedHeaders,
        bodyIsEncoded: hasEncodedBody,
      };
      const responseRelayOptionsHeader =
        formatMteRelayHeader(responseRelayOptions);
      responseHeaders[options.mteRelayHeader] = responseRelayOptionsHeader;

      // copy proxyResponse headers to reply
      reply.status(proxyResponse.status);
      reply.headers(responseHeaders);

      reply.send(payload);
    } catch (error) {
      request.log.error(error);
      if (error instanceof MteRelayError) {
        return reply.status(error.status).send(error);
      }
      let msg = "An unknown error occurred";
      if (error instanceof Error) {
        msg = error.message;
      }
      reply.status(500).send(msg);
    }
  }

  done();
}

export default proxyHandler;

// determine if encoded content should be decoded to text or to UInt8Array
async function streamToUint8Array(stream: Readable): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];

  return new Promise<Uint8Array>((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    stream.on("end", () => {
      const buffer = Buffer.concat(chunks);
      resolve(new Uint8Array(buffer));
    });

    stream.on("error", (error) => {
      reject(error);
    });
  });
}
