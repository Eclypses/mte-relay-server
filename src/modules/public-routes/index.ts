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

  // GET /api/mte-parse?headers=
  fastify.get<{ Querystring: { headers: string } }>(
    "/api/mte-parse",
    (request, reply) => {
      const result = parseMteRelayHeader(request.query.headers);
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
