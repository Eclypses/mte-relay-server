import { FastifyRequest, FastifyInstance, FastifyReply, HTTPMethods } from "fastify";
import { mkeDecode, mkeEncode } from "./mte";
import fs from "fs";
import { concatTwoUint8Arrays } from "../utils/concat-arrays";
import { cloneHeaders, makeHeaderAString } from "../utils/header-utils";
import { MteRelayError } from "./mte/errors";

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
  },
  done: any
) {
  // log mte usage
  fastify.addHook("onRequest", async (request, reply) => {
    if (!request.clientId) {
      request.log.error(`Missing clientID header.`);
      return reply.status(401).send("Unauthorized");
    }
    if (!request.pairId) {
      const err = new MteRelayError("PairID is required, but not found.");
      request.log.error(err.message);
      return reply.status(err.status).send(err.message);
    }
    request.log.info(
      {
        ClientId: request.clientId,
        url: request.url,
        encoderType: request.encoderType,
      },
      `MTE Proxy Route used: ${request.url}`
    );
    const mteRelayHeader = request.headers[options.mteRelayHeader] as string;
    reply.header(options.mteRelayHeader, mteRelayHeader);
  });

  // if not multipart/form-data, put entire buffer on request.body, and handle decode in handler
  fastify.addContentTypeParser("*", function (_request, payload, done) {
    // parse data
    let _buffer = new Uint8Array(0);
    payload.on("data", (chunk: Uint8Array) => {
      _buffer = concatTwoUint8Arrays(_buffer, chunk);
    });
    payload.on("end", async () => {
      done(null, _buffer.length > 0 ? _buffer : undefined);
    });
  });

  // remove OPTIONS from httpMethods, they are not needed for server-to-server proxy
  const disallowedMethods = ["OPTIONS", "HEAD"];
  const methods = options.httpMethods.filter((method) => !disallowedMethods.includes(method));

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

      // decode route
      const uriDecodeUrl = decodeURIComponent(request.url.slice(1));
      const decryptedUrl = await mkeDecode(uriDecodeUrl, {
        stateId: `decoder.${request.clientId}.${request.pairId}`,
        output: "str",
        type: request.encoderType,
      }).catch((err) => {
        throw new MteRelayError("Failed to decode.", err);
      });

      // set headers for proxy request
      const proxyHeaders = cloneHeaders(request.headers);
      delete proxyHeaders[options.encodedHeadersHeader];
      delete proxyHeaders[options.mteRelayHeader];
      delete proxyHeaders["content-length"];
      proxyHeaders.host = options.upstream.replace(/https?:\/\//, "");
      proxyHeaders["cache-control"] = "no-cache";

      // set decoded payload to this variable
      let proxyPayload: any = undefined;

      // array of paths of tmp files to delete after request
      let tmpFilesToDelete: string[] = [];

      // decoded headers
      let mkeDecodedHeaders: Record<string, string> = {};
      const encodedHeaders = request.headers[options.encodedHeadersHeader] as string;
      if (encodedHeaders) {
        const decodedHeaders = await mkeDecode(encodedHeaders, {
          stateId: `decoder.${request.clientId}.${request.pairId}`,
          output: "str",
          type: request.encoderType,
        });
        const headers = JSON.parse(decodedHeaders as string);
        Object.entries(headers).forEach(([key, value]) => {
          mkeDecodedHeaders[key] = value as string;
          proxyHeaders[key] = value as string;
        });
        request.log.debug(`Decoded Headers:\n${JSON.stringify(headers)}`);
      }

      /**
       * Handle NON-multipart/form-data requests
       */
      if (Boolean(request.body)) {
        // decode incoming payload
        const contentType = request.headers["content-type"] || "application/json";
        let decodedPayload: any = request.body;
        if (request.body) {
          decodedPayload = await mkeDecode(request.body as any, {
            stateId: `decoder.${request.clientId}.${request.pairId}`,
            output: contentTypeIsText(contentType) ? "str" : "Uint8Array",
            type: request.encoderType,
          }).catch((err) => {
            throw new MteRelayError("Failed to decode.", err);
          });
        }

        // set decoded payload to proxyPayload
        proxyPayload = decodedPayload;
      }

      // make new request
      let proxyResponse: void | Response = void 0;
      try {
        proxyResponse = await fetch(options.upstream + "/" + decryptedUrl, {
          method: request.method,
          headers: proxyHeaders,
          body: proxyPayload,
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

      request.log.debug(`Proxy Response Headers - Original:\n${proxyResponse.headers}`);

      // create response headers
      const methods = proxyResponse.headers.get("access-control-allow-methods");
      if (methods) {
        proxyResponse.headers.set("access-control-allow-methods", methods);
      }

      // @ts-ignore
      const proxyResponseHeaders = cloneHeaders(proxyResponse.headers);

      // merge these headers with upstream server headers, if present
      proxyResponseHeaders["access-control-allow-headers"] = (() => {
        let value: string[] = [];
        const replyHeader = reply.getHeader("access-control-allow-headers");
        if (replyHeader) {
          value.push(makeHeaderAString(replyHeader));
        }
        const proxyResponseHeader = proxyResponse.headers.get("access-control-allow-headers");
        if (proxyResponseHeader) {
          value.push(makeHeaderAString(proxyResponseHeader));
        }
        return value.join(", ");
      })();
      proxyResponseHeaders["access-control-expose-headers"] = (() => {
        let value: string[] = [];
        const replyHeader = reply.getHeader("access-control-expose-headers");
        if (replyHeader) {
          value.push(makeHeaderAString(replyHeader));
        }
        const proxyResponseHeader = proxyResponse.headers.get("access-control-expose-headers");
        if (proxyResponseHeader) {
          value.push(makeHeaderAString(proxyResponseHeader));
        }
        return value.join(", ");
      })();
      delete proxyResponseHeaders["content-length"];
      delete proxyResponseHeaders["transfer-encoding"];
      delete proxyResponseHeaders["access-control-allow-origin"];
      proxyResponseHeaders[options.encodedHeadersHeader];

      // copy cookies
      const setCookie = proxyResponse.headers.get("set-cookie");
      if (setCookie) {
        proxyResponseHeaders["set-cookie"] = setCookie;
      }

      request.log.debug(`Proxy Response Headers - Modified:\n${proxyResponse.headers}`);
      // encode headers
      const headersToEncode: Record<string, string> = {};
      const contentTypeHeader = proxyResponse.headers.get("content-type");
      if (contentTypeHeader) {
        headersToEncode["content-type"] = contentTypeHeader;
      }
      Object.entries(mkeDecodedHeaders).forEach(([key, value]) => {
        headersToEncode[key] = value;
      });
      const encodedHeadersJson = JSON.stringify(headersToEncode);
      const encodedResponseHeaders = await mkeEncode(encodedHeadersJson, {
        stateId: `encoder.${request.clientId}.${request.pairId}`,
        output: "B64",
        type: request.encoderType,
      }).catch((err) => {
        throw new MteRelayError("Failed to encode.", err);
      });
      proxyResponseHeaders[options.encodedHeadersHeader] = encodedResponseHeaders as string;

      // copy proxyResponse headers to reply
      reply.headers(proxyResponseHeaders);
      reply.status(proxyResponse.status);

      // if no body, send reply
      const _body = await proxyResponse.arrayBuffer();
      if (!_body || _body.byteLength === 0) {
        reply.headers(proxyResponseHeaders);
        return reply.send();
      }

      // encode body
      const encodedBody = await mkeEncode(new Uint8Array(_body), {
        stateId: `encoder.${request.clientId}.${request.pairId}`,
        output: "Uint8Array",
        type: request.encoderType,
      }).catch((err) => {
        throw new MteRelayError("Failed to encode.", err);
      });
      const _buffer = Buffer.from(encodedBody as Uint8Array);
      proxyResponseHeaders["content-type"] = "application/octet-stream";
      proxyResponseHeaders["content-length"] = _buffer.length.toString();
      reply.headers(proxyResponseHeaders);

      reply.send(_buffer);

      // delete tmp files if they exist
      if (tmpFilesToDelete.length > 0) {
        tmpFilesToDelete.forEach((file) => {
          fs.promises.rm(file).catch((err) => {
            request.log.error(`Error deleting tmp file: ${err}`);
          });
        });
      }
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
function contentTypeIsText(contentType: string) {
  const textsTypes = ["text", "json", "xml", "javascript", "urlencoded"];
  const _lowerContentType = contentType.toLowerCase();
  let i = 0;
  const iMax = textsTypes.length;
  for (; i < iMax; i++) {
    const _type = textsTypes[i];
    if (_lowerContentType.includes(_type)) {
      return true;
    }
  }
  return false;
}
