import { FastifyPluginCallback } from "fastify";
import fastifyPlugin from "fastify-plugin";

const addCustomHeader: FastifyPluginCallback<{
  headers?: Record<string, string>;
  isDebug?: boolean;
}> = (fastify, options, done) => {
  if (options.headers) {
    fastify.addHook("onRequest", (request, reply, _done) => {
      for (const [key, value] of Object.entries(options.headers!)) {
        reply.header(key, value);
        request.headers[key] = value;
      }
      _done();
    });
  }

  if (options.isDebug) {
    fastify.addHook("onRequest", (request, reply, _done) => {
      reply.header("x-request-id", request.id);
      _done();
    });
  }
  done();
};

export default fastifyPlugin(addCustomHeader);
