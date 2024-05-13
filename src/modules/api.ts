import { FastifyPluginCallback } from "fastify";
import { z } from "zod";
import {
  instantiateEncoder,
  instantiateDecoder,
  getKyberResponder,
} from "./mte";
import { getNonce } from "../utils/nonce";
import { MteRelayError } from "./mte/errors";
import mteIdManager from "./mte-id-manager";

const mtePairArraySchema = z.array(
  z.object({
    pairId: z.string(),
    encoderPublicKey: z.string(),
    encoderPersonalizationStr: z.string(),
    decoderPublicKey: z.string(),
    decoderPersonalizationStr: z.string(),
  })
);

/**
 * Protect API Routes that require x-mte-id header
 */
export const mtePairRoutes: FastifyPluginCallback<{
  mteRelayHeader: string;
  clientIdSecret: string;
}> = async (fastify, options) => {
  // Register MTE ID manager module
  await fastify.register(mteIdManager, {
    clientIdSecret: options.clientIdSecret,
    mteRelayHeader: options.mteRelayHeader,
  });

  // HEAD /api/mte-relay
  fastify.head("/api/mte-relay", (request, reply) => {
    reply.header(options.mteRelayHeader, request.clientIdSigned);
    reply.status(200).send();
  });

  // mte pair route
  fastify.post("/api/mte-pair", async (request, reply) => {
    try {
      reply.header(options.mteRelayHeader, request.clientIdSigned);

      // validate request body
      const validationResult = mtePairArraySchema.safeParse(request.body);
      if (!validationResult.success) {
        request.log.error(validationResult.error);
        return reply
          .status(400)
          .send(JSON.stringify(validationResult.error, null, 2));
      }

      const returnInitValues = [];
      // create encoders and decoders
      for (const pair of validationResult.data) {
        // create encoder
        const encoderNonce = getNonce();
        const encoderKyber = getKyberResponder(pair.decoderPublicKey);
        instantiateEncoder({
          id: `encoder.${request.relayOptions.clientId}.${pair.pairId}`,
          entropy: encoderKyber.secret,
          nonce: encoderNonce,
          personalization: pair.decoderPersonalizationStr,
        });

        // create decoder
        const decoderNonce = getNonce();
        const decoderKyber = getKyberResponder(pair.encoderPublicKey);
        instantiateDecoder({
          id: `decoder.${request.relayOptions.clientId}.${pair.pairId}`,
          entropy: decoderKyber.secret,
          nonce: decoderNonce,
          personalization: pair.encoderPersonalizationStr,
        });

        returnInitValues.push({
          pairId: pair.pairId,
          encoderNonce,
          encoderSecret: encoderKyber.encryptedSecret,
          decoderNonce,
          decoderSecret: decoderKyber.encryptedSecret,
        });
      }

      // send response
      return reply.status(200).send(returnInitValues);
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
      reply.status(500).send(msg);
    }
  });
};
