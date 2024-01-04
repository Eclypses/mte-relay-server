import { FastifyPluginCallback } from "fastify";
import { contentTypeIsText } from "../utils/is-text";
import { concatTwoUint8Arrays } from "../utils/concat-arrays";

/**
 * - if a route matches the passThrough routes in options
 * - let it pass through un affected
 */
const passThroughRoutes: FastifyPluginCallback<{
  routes: string[];
  upstream: string;
}> = (fastify, options, done: any) => {
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
      done(null, _buffer.length > 0 ? _buffer : undefined);
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

        const { host, ...headersSansHost } = request.headers;

        const proxyResponse = await fetch(options.upstream + request.url, {
          method: request.method,
          headers: headersSansHost as unknown as HeadersInit,
          body: request.body as unknown as ArrayBuffer,
        });

        proxyResponse.headers.delete("access-control-allow-origin");
        proxyResponse.headers.delete("access-control-allow-methods");
        proxyResponse.headers.delete("transfer-encoding");

        reply.headers(proxyResponse.headers);
        reply.status(proxyResponse.status);

        // return response
        return reply.send(await proxyResponse.arrayBuffer());
      } catch (error) {
        request.log.error(error);
        let message = "An unknown error occurred";
        if (error instanceof Error) {
          message = error.message;
        }
        reply.status(500).send(message);
      }
    });
  });

  done();
};

export default passThroughRoutes;
