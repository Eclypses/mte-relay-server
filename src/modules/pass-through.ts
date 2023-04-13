import axios from "axios";
import { FastifyInstance } from "fastify";
import { contentTypeIsText } from "../utils/is-text";
import { concatTwoUint8Arrays } from "../utils/concat-arrays";

/**
 * - if a route matches the passThrough routes in options
 * - let it pass through un affected
 */

async function passThroughRoutes(
  fastify: FastifyInstance,
  options: {
    routes: string[];
    upstream: string;
  },
  done: any
) {
  // remove all content type parsers
  fastify.removeAllContentTypeParsers();

  // clone body
  fastify.addContentTypeParser("*", function (request, payload, done) {
    // parse data
    let _buffer = new Uint8Array();
    payload.on("data", (chunk: Uint8Array) => {
      _buffer = concatTwoUint8Arrays(_buffer, chunk);
    });
    payload.on("end", () => {
      done(null, _buffer);
    });
  });

  options.routes.forEach((route) => {
    fastify.all(route, async (request, reply) => {
      try {
        const contentType = request.headers["content-type"];

        if (contentType && contentTypeIsText(contentType)) {
          const textDecoder = new TextDecoder("utf-8");
          const text = textDecoder.decode(request.body as Uint8Array);
          request.body = text;
        }

        // clone headers
        const proxyHeaders: Record<string, string> = {};
        Object.entries(request.headers).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            value.forEach((v) => {
              proxyHeaders[key] = v;
            });
            return;
          }
          if (typeof value === "string") {
            proxyHeaders[key] = value;
            return;
          }
        });
        delete proxyHeaders.host;

        // proxy request
        const proxyResponse = await axios({
          method: request.method,
          url: options.upstream + request.url,
          headers: proxyHeaders,
          data: request.body,
          maxRedirects: 0,
          responseType: "arraybuffer",
          validateStatus: () => true,
          transformRequest: [
            (data, _headers) => {
              // no transform
              return data;
            },
          ],
          transformResponse: [
            (data, _headers) => {
              // no transform
              return data;
            },
          ],
        });

        delete proxyResponse.headers["access-control-allow-origin"];
        delete proxyResponse.headers["access-control-allow-methods"];
        delete proxyResponse.headers["transfer-encoding"];

        reply.headers(proxyResponse.headers);
        reply.status(proxyResponse.status);

        // return response
        return reply.send(proxyResponse.data);
      } catch (error) {
        console.log(error);
        reply.status(500).send("failed");
      }
    });
  });

  done();
}

export default passThroughRoutes;
