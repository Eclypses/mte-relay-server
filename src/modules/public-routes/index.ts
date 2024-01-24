import { FastifyPluginCallback } from "fastify";
import passThroughRoutes from "./pass-through";
import { MTE_ERRORS } from "../mte/errors";
import { parseMteRelayHeader } from "../../utils/mte-relay-header";

/**
 * Register non-MTE routes here.
 */
export const publicRoutes: FastifyPluginCallback<{
  routes: string[];
  upstream: string;
}> = (fastify, options, done) => {
  // echo endpoint
  fastify.get<{ Params: { msg?: string } }>(
    "/api/mte-echo/:msg?",
    (request, reply) => {
      reply.send({
        echo: request.params.msg || true,
        time: Date.now(),
      });
    }
  );

  // /api/mte-errors
  fastify.get("/api/mte-errors", (_request, reply) => {
    reply.send(MTE_ERRORS);
  });

  // GET /api/decode-headers/:headers
  fastify.get<{ Params: { headers: string } }>(
    "/api/decode-headers/:headers",
    (request, reply) => {
      const result = parseMteRelayHeader(request.params.headers);
      reply.send(result);
    }
  );

  // pass through routes
  fastify.register(passThroughRoutes, {
    routes: options.routes,
    upstream: options.upstream,
  });

  done();
};
