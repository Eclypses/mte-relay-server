import axios from "axios";
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

  // all requests, handle incoming body as stream
  fastify.addContentTypeParser("*", function (_request, _payload, _done) {
    _done(null);
  });

  options.routes.forEach((route) => {
    fastify.all(route, async (request, reply) => {
      try {
        // clone headers
        const proxyHeaders = { ...request.headers };
        delete proxyHeaders.host;

        // proxy request
        const proxyResponse = await axios({
          method: request.method,
          url: options.upstream + request.url,
          headers: proxyHeaders,
          data: request.raw,
          maxRedirects: 0,
          responseType: "stream",
          validateStatus: (status) => status < 400,
        });

        delete proxyResponse.headers["access-control-allow-origin"];
        delete proxyResponse.headers["access-control-allow-methods"];
        delete proxyResponse.headers["transfer-encoding"];

        // @ts-ignore - this is fine.
        reply.headers(proxyResponse.headers);
        reply.status(proxyResponse.status);

        // return response
        return reply.send(proxyResponse.data);
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
