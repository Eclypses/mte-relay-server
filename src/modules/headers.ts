import { FastifyInstance } from "fastify";
import fastifyPlugin from "fastify-plugin";

async function customHeader(
  _fastify: FastifyInstance,
  options: {
    headers?: Record<string, string>;
  },
  done: any
) {
  if (options.headers) {
    _fastify.addHook("onRequest", (request, reply, _done) => {
      for (const [key, value] of Object.entries(options.headers!)) {
        reply.header(key, value);
        request.headers[key] = value;
      }
      _done();
    });
  }
  done();
}

export default fastifyPlugin(customHeader);
