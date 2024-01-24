import { FastifyPluginCallback } from "fastify";
import fastifyPlugin from "fastify-plugin";
import crypto from "crypto";
import { signAString, verifySignedString } from "../utils/signed-ids";
import { MteRelayError } from "./mte/errors";
import { RelayOptions, parseMteRelayHeader } from "../utils/mte-relay-header";

// extend FastifyRequest interface with decorator method
declare module "fastify" {
  interface FastifyRequest {
    relayOptions: RelayOptions;
    clientIdSigned: string;
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
  // set default object for request.relayOptions
  fastify.decorateRequest("relayOptions", {});

  // on every request
  fastify.addHook("onRequest", (request, reply, _done) => {
    try {
      // parse x-mte-relay header from request
      const mteRelayHeader = request.headers[options.mteRelayHeader] as string;
      if (mteRelayHeader) {
        request.relayOptions = parseMteRelayHeader(mteRelayHeader);
      }

      // use existing clientId, or generate a new one
      if (request.relayOptions.clientId) {
        const verified = verifySignedString(
          request.relayOptions.clientId,
          options.clientIdSecret
        );
        if (!verified) {
          request.log.error(
            `Invalid Client ID: ${request.relayOptions.clientId}`
          );
          throw new MteRelayError("Invalid Client ID header.");
        }
      } else {
        request.relayOptions.clientId = crypto.randomUUID();
      }

      // create signed clientId
      const signedClientId = signAString(
        request.relayOptions.clientId,
        options.clientIdSecret
      );
      request.clientIdSigned = signedClientId;
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
