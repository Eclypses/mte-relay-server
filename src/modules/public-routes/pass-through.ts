import { FastifyPluginCallback } from "fastify";

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
  fastify.addContentTypeParser("*", function (_request, _payload, done) {
    done(null);
  });

  options.routes.forEach((route) => {
    fastify.all(route, async (request, reply) => {
      try {
        const { host, ...headersSansHost } = request.headers;

        const proxyResponse = await fetch(options.upstream + request.url, {
          method: request.method,
          headers: headersSansHost as unknown as HeadersInit,
          body: request.body
            ? (request.raw as unknown as ReadableStream<Uint8Array>)
            : undefined,
          // @ts-ignore - required, but not in TS definitions
          duplex: "half",
        });

        const headers = new Headers(proxyResponse.headers);

        // @ts-ignore - it's fine.
        reply.headers(headers);
        reply.status(proxyResponse.status);

        return reply.send(proxyResponse.body);
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
