import { FastifyPluginCallback } from "fastify";
import fetch from "node-fetch";

/**
 * - if a route matches the passThrough routes in options
 * - let it pass through un affected
 */
const passThroughRoutes: FastifyPluginCallback<{
  routes: string[];
  upstream: string;
}> = (fastify, options, done: any) => {
  fastify.removeAllContentTypeParsers();
  fastify.addContentTypeParser("*", function (_request, _payload, done) {
    done(null);
  });

  options.routes.forEach((route) => {
    fastify.all(route, async (request, reply) => {
      try {
        const headers: Record<string, string> = {};
        for (const entry of Object.entries(request.headers)) {
          headers[entry[0]] = entry[1] as string;
        }
        delete headers["host"];
        delete headers["content-length"];

        let body: any = undefined;
        if (["GET", "HEAD"].includes(request.method) === false) {
          body = request.raw;
        }

        const proxyResponse = await fetch(options.upstream + request.url, {
          method: request.method,
          headers,
          body,
          // @ts-ignore - required, but not in TS definitions
          duplex: "half",
        });
        proxyResponse.headers.forEach((value, key) => {
          reply.header(key, value);
        });
        reply.header("content-encoding", undefined);
        reply.status(proxyResponse.status);
        // @ts-ignore
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
