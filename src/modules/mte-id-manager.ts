import { FastifyPluginCallback } from "fastify";
import fastifyPlugin from "fastify-plugin";
import crypto from "crypto";
import { signAString, verifySignedString } from "../utils/signed-ids";
import { MteRelayError } from "./mte/errors";

// extend FastifyRequest interface with decorator method
declare module "fastify" {
  interface FastifyRequest {
    clientId: null | string;
    pairId: null | string;
  }
}

/**
 * - Add MTE Server ID to every reply
 * - Set/Refresh MTE Client ID header on every request
 * - Decorate every request with "clientId" property
 *    - clientId = MTE Client ID header
 *    - sessionId = MTE Client ID header + MTE Client ID header
 *        - sessionId allows new Encoder/Decoders for each separate tab/window of a website user
 */
const mteIdManager: FastifyPluginCallback<{
  clientIdSecret: string;
  clientIdHeader: string;
  sessionIdHeader: string;
  pairIdHeader: string;
  serverIdHeader: string;
  mteServerId: string;
}> = (fastify, options, done) => {
  // decorate request object with clientId
  fastify.decorateRequest("clientId", null);
  fastify.decorateRequest("pairId", null);

  // on every request
  fastify.addHook("onRequest", (request, reply, _done) => {
    try {
      // add x-mte-relay-server-id header to the every response
      reply.header(options.serverIdHeader, options.mteServerId);

      // get x-mte-relay-client-id header from request
      // if it exists, verify it, else set a new ID
      const clientIdHeader = request.headers[options.clientIdHeader] as string;
      let clientId: string = crypto.randomUUID();
      if (clientIdHeader) {
        const verified = verifySignedString(
          clientIdHeader,
          options.clientIdSecret
        );
        if (!verified) {
          request.log.error(`Invalid ${options.clientIdHeader} header.`);
          throw new MteRelayError("Invalid Client ID header.");
        }
        clientId = verified;
      }

      // set x-mte-relay-client-id header on every response
      const signedClientId = signAString(clientId, options.clientIdSecret);
      reply.header(options.clientIdHeader, signedClientId);

      // use x-mte-relay-client-id header to decorate request object with clientId
      request.clientId = clientId;

      // pair ID is clientId OR clientId.sessionId
      let pairId = request.headers[options.pairIdHeader] as string;
      if (pairId) {
        reply.header(options.pairIdHeader, pairId);
      } else {
        pairId = request.headers[options.sessionIdHeader] as string;
        reply.header(options.sessionIdHeader, pairId);
      }
      if (pairId) {
        request.pairId = pairId;
      }
    } catch (error) {
      request.log.error(error);
      if (error instanceof MteRelayError) {
        reply.status(error.status).send({
          error: error.message,
          info: error.info,
        });
      } else {
        let msg = "An unknown error occurred";
        if (error instanceof Error) {
          msg = error.message;
        }
        reply.status(500).send(msg);
      }
    }
    _done();
  });

  done();
};

export default fastifyPlugin(mteIdManager);
