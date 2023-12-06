import { FastifyPluginCallback } from "fastify";
import fastifyPlugin from "fastify-plugin";
import crypto from "crypto";
import { signAString, verifySignedString } from "../utils/signed-ids";
import { MteRelayError } from "./mte/errors";
import { parseMteRelayHeader } from "../utils/mte-relay-header";

// extend FastifyRequest interface with decorator method
declare module "fastify" {
  interface FastifyRequest {
    clientId: null | string;
    clientIdSigned: null | string;
    pairId: null | string;
    encoderType: "MKE" | "MTE";
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
  mteRelayHeader: string;
}> = (fastify, options, done) => {
  fastify.decorateRequest("clientId", null);
  fastify.decorateRequest("clientIdSigned", null);
  fastify.decorateRequest("pairId", null);
  fastify.decorateRequest("encoderType", "MKE");

  // on every request
  fastify.addHook("onRequest", (request, reply, _done) => {
    try {
      // parse x-mte-relay header from request
      const mteRelayHeader = request.headers[options.mteRelayHeader] as string;
      let relayValues: any = {};
      if (mteRelayHeader) {
        relayValues = parseMteRelayHeader(mteRelayHeader);
      }
      request.pairId = relayValues.pairId;
      request.encoderType = relayValues.type;

      // use existing clientId, or generate a new one
      let clientId: string = crypto.randomUUID();
      if (relayValues.clientId) {
        const verified = verifySignedString(relayValues.clientId, options.clientIdSecret);
        if (!verified) {
          request.log.error(`Invalid Client ID.`);
          throw new MteRelayError("Invalid Client ID header.");
        }
        clientId = verified;
      }
      const signedClientId = signAString(clientId, options.clientIdSecret);
      request.clientIdSigned = signedClientId;
      request.clientId = clientId;
    } catch (error) {
      request.log.error(error);
      if (error instanceof MteRelayError) {
        return reply.status(error.status).send({
          error: error.message,
          info: error.info,
        });
      }
      let msg = "An unknown error occurred";
      if (error instanceof Error) {
        msg = error.message;
      }
      return reply.status(500).send(msg);
    }
    _done();
  });

  done();
};

export default fastifyPlugin(mteIdManager);
