import {
  FastifyRequest,
  FastifyInstance,
  FastifyReply,
  HTTPMethods,
} from "fastify";
import fetch from "node-fetch";
import { decode, encode } from "./mte";
import mteIdManager from "./mte-id-manager";
import { MteRelayError } from "./mte/errors";
import { Transform } from "stream";
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
    outboundToken: options.outboundToken,
  });

  // for all content-types, forward incoming stream
  fastify.removeAllContentTypeParsers();
  fastify.addContentTypeParser("*", function (_request, payload, done) {
    return done(null);
  });

  // log mte usage
  fastify.addHook("onRequest", (request, reply, _done) => {
    if (request.isOutbound) {
      // do we log outbound requests?
      return _done();
    }

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
    _done();
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
      // determine if authorized outbound-proxy, ELSE if inbound-proxy
      if (request.isOutbound) {
        const upstream = request.headers["x-mte-upstream"] as string;
        if (!upstream) {
          return reply.status(400).send("Missing x-mte-upstream header.");
        }
        const _request = new Request(upstream + request.url, {
          method: request.method,
          // @ts-ignore - this is fine, i think
          headers: request.headers,
          body: request.raw as unknown as ReadableStream<Uint8Array>,
        });
        //@ts-ignore
        const response = await fetch(_request);
        //@ts-ignore
        const _response = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
        return _response;
      }

      const itemsToDecode: {
        data: string | Uint8Array;
        output: "str" | "Uint8Array" | "stream";
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

      // handle body as stream
      if (request.relayOptions.bodyIsEncoded) {
        itemsToDecode.push({
          data: "stream",
          output: "stream",
        });
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

      // clone request headers
      const proxyHeaders = new Headers();
      Object.entries(request.headers).forEach((entry) => {
        proxyHeaders.set(entry[0], entry[1] as string);
      });

      // delete few headers we don't want to forward upstream
      const headersToDelete = [
        "host",
        "content-type",
        "content-length",
        options.mteRelayHeader,
        options.encodedHeadersHeader,
      ];
      for (const header in request.headers) {
        if (headersToDelete.includes(header.toLowerCase())) {
          proxyHeaders.delete(header);
        }
      }

      // append new headers
      proxyHeaders.set("host", options.upstream.replace(/https?:\/\//, ""));

      // decode headers, if present
      let decodedHeaders: Record<string, string> = {};
      if (request.relayOptions.headersAreEncoded) {
        decodedHeaders = JSON.parse(result[0] as string);
        Object.entries(decodedHeaders).forEach(([key, value]) => {
          proxyHeaders.set(key, value);
        });
        request.log.debug(
          `Decoded Headers:\n${JSON.stringify(decodedHeaders)}`
        );
        result.shift();
      }

      // decode payload, if present
      let proxyPayload: any = undefined;
      if (request.relayOptions.bodyIsEncoded) {
        const returnData = result[0];
        if ("decryptChunk" in returnData == false) {
          throw new Error("Return data does not contain decryptChunk");
        }
        const { decryptChunk, finishDecrypt } = returnData;
        proxyPayload = new Transform({
          transform(chunk, _encoding, callback) {
            try {
              const u8 = new Uint8Array(chunk);
              const decrypted = decryptChunk(u8);
              if (decrypted === null) {
                return callback(new Error("Decryption failed."));
              }
              this.push(decrypted);
              callback();
            } catch (error) {
              callback(error as Error);
            }
          },
          final(callback) {
            const data = finishDecrypt();
            if (data === null) {
              return callback(new Error("Decryption final failed."));
            }
            this.push(data);
            callback();
          },
        });
        request.raw.pipe(proxyPayload);
      }

      // make new request
      let proxyResponse: void | fetch.Response = void 0;
      try {
        proxyResponse = await fetch(options.upstream + "/" + decryptedUrl, {
          method: request.method,
          headers: proxyHeaders as unknown as fetch.HeadersInit,
          body: proxyPayload as any,
          // @ts-ignore
          duplex: "half",
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

      // create response headers
      proxyResponse.headers.forEach((value, key) => {
        reply.header(key, value);
      });

      // merge access-control-allow-headers
      (() => {
        let values = new Set<string>();
        values.add(options.encodedHeadersHeader);
        values.add(options.mteRelayHeader);
        const replyHeader = reply.getHeader("access-control-allow-headers");
        if (replyHeader) {
          String(replyHeader)
            .split(",")
            .forEach((header) => {
              values.add(header.trim().toLowerCase());
            });
        }
        const proxyResponseHeader = proxyResponse.headers.get(
          "access-control-allow-headers"
        );
        if (proxyResponseHeader) {
          String(proxyResponseHeader)
            .split(",")
            .forEach((header) => {
              values.add(header.trim().toLowerCase());
            });
        }
        reply.removeHeader("access-control-allow-headers");
        const headerValue = Array.from(values).join(", ");
        reply.header("access-control-allow-headers", headerValue);
      })();
      // merge "access-control-expose-headers" header
      (() => {
        let values = new Set<string>();
        values.add(options.encodedHeadersHeader);
        values.add(options.mteRelayHeader);
        const replyHeader = reply.getHeader("access-control-expose-headers");
        if (replyHeader) {
          String(replyHeader)
            .split(",")
            .forEach((header) => {
              values.add(header.trim().toLowerCase());
            });
        }
        const proxyResponseHeader = proxyResponse.headers.get(
          "access-control-expose-headers"
        );
        if (proxyResponseHeader) {
          String(replyHeader)
            .split(",")
            .forEach((header) => {
              values.add(header.trim().toLowerCase());
            });
        }
        // delete encoded headers from this header
        Object.keys(decodedHeaders).forEach((header) => {
          values.delete(header);
        });
        reply.removeHeader("access-control-expose-headers");
        const headerValue = Array.from(values).join(", ");
        reply.header("access-control-expose-headers", headerValue);
      })();

      // don't forward these headers to client
      const headerToDelete = [
        "set-cookie",
        "content-length",
        "content-encoding",
        options.mteRelayHeader,
      ];
      headerToDelete.forEach((header) => {
        reply.removeHeader(header);
      });

      // copy cookies - they have a special implementation
      proxyResponse.headers.raw()["set-cookie"]?.forEach((cookie) => {
        reply.header("set-cookie", cookie);
      });

      request.log.debug(
        `Proxy Response Headers - Modified:\n${proxyResponse.headers}`
      );

      // collect data to be encoded
      const itemsToEncode: {
        data: string | Uint8Array;
        output: "B64" | "Uint8Array" | "stream";
      }[] = [];

      // collect Headers to encode
      const headersToEncode: Record<string, string> = {};
      Object.keys(decodedHeaders).forEach((key) => {
        const value = proxyResponse?.headers.get(key);
        if (value) {
          headersToEncode[key] = value;
          reply.removeHeader(key);
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

      // encode body as stream
      itemsToEncode.push({
        data: "stream",
        output: "stream",
      });

      // encode response
      const results = await encode({
        id: `encoder.${request.relayOptions.clientId}.${request.relayOptions.pairId}`,
        items: itemsToEncode,
        type: request.relayOptions.encodeType!,
      });

      // attached encoded headers to response
      if (hasEncodedHeaders) {
        reply.header(options.encodedHeadersHeader, results[0] as string);
        results.shift();
      }

      // set relay options header
      const responseRelayOptions: RelayOptions = {
        clientId: request.clientIdSigned,
        pairId: request.relayOptions.pairId,
        encodeType: request.relayOptions.encodeType,
        urlIsEncoded: false,
        headersAreEncoded: hasEncodedHeaders,
        bodyIsEncoded: true,
      };
      const responseRelayOptionsHeader =
        formatMteRelayHeader(responseRelayOptions);
      reply.header(options.mteRelayHeader, responseRelayOptionsHeader);

      // copy proxyResponse headers to reply
      reply.status(proxyResponse.status);

      // if body is encoded, update payload
      const returnData = results[0];
      if ("encryptChunk" in returnData === false) {
        throw new Error("Invalid return data.");
      }
      const { encryptChunk, finishEncrypt } = returnData;
      const transformStream = new Transform({
        transform(chunk, _encoding, callback) {
          try {
            const u8 = new Uint8Array(chunk);
            const encrypted = encryptChunk(u8);
            if (encrypted === null) {
              return callback(new Error("Encryption failed."));
            }
            this.push(encrypted);
            callback();
          } catch (error) {
            callback(error as Error);
          }
        },
        final(callback) {
          const data = finishEncrypt();
          if (data === null) {
            return callback(new Error("Encryption final failed."));
          }
          this.push(data);
          callback();
        },
      });
      // @ts-ignore
      // const readableStream = Readable.fromWeb(proxyResponse.body);
      // @ts-ignore
      proxyResponse.body?.pipe(transformStream);
      return reply.send(transformStream);
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
