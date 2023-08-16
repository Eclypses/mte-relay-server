import { FastifyPluginCallback } from "fastify";
import { z } from "zod";
import { getEcdh } from "../utils/ecdh";
import { instantiateEncoder, instantiateDecoder } from "./mte";
import { getNonce } from "../utils/nonce";
import { MTE_ERRORS, MteRelayError } from "./mte/errors";

/**
 * Protect API Routes that require x-mte-id header
 */
export const protectedApiRoutes: FastifyPluginCallback<{
  clientIdHeader: string;
}> = (fastify, options, done) => {
  // on every request
  fastify.addHook("onRequest", (request, reply, done) => {
    if (!request.clientId) {
      request.log.error(`Missing ${options.clientIdHeader} header.`);
      return reply.code(400).send(`Missing ${options.clientIdHeader} header.`);
    }
    done();
  });

  // mte pair route
  const mtePairSchema = z.object({
    encoderPublicKey: z.string(),
    encoderPersonalizationStr: z.string(),
    decoderPublicKey: z.string(),
    decoderPersonalizationStr: z.string(),
  });
  const mtePairArraySchema = z.array(
    z.object({
      pairId: z.string(),
      encoderPublicKey: z.string(),
      encoderPersonalizationStr: z.string(),
      decoderPublicKey: z.string(),
      decoderPersonalizationStr: z.string(),
    })
  );
  const bodySchema = z.union([mtePairSchema, mtePairArraySchema]);
  fastify.post("/api/mte-pair", async (request, reply) => {
    try {
      // validate request body
      const validationResult = bodySchema.safeParse(request.body);
      if (!validationResult.success) {
        request.log.error(validationResult.error);
        return reply
          .status(400)
          .send(JSON.stringify(validationResult.error, null, 2));
      }

      if (Array.isArray(validationResult.data)) {
        const returnInitValues = [];
        // create encoders and decoders
        for (const pair of validationResult.data) {
          // create encoder
          const encoderNonce = getNonce();
          const encoderEcdh = getEcdh();
          const encoderEntropy = encoderEcdh.computeSharedSecret(
            pair.decoderPublicKey
          );
          instantiateEncoder({
            id: `encoder.${request.clientId}.${pair.pairId}`,
            entropy: encoderEntropy,
            nonce: encoderNonce,
            personalization: pair.decoderPersonalizationStr,
          });

          // create decoder
          const decoderNonce = getNonce();
          const decoderEcdh = getEcdh();
          const decoderEntropy = decoderEcdh.computeSharedSecret(
            pair.encoderPublicKey
          );
          instantiateDecoder({
            id: `decoder.${request.clientId}.${pair.pairId}`,
            entropy: decoderEntropy,
            nonce: decoderNonce,
            personalization: pair.encoderPersonalizationStr,
          });

          returnInitValues.push({
            pairId: pair.pairId,
            encoderNonce,
            encoderPublicKey: encoderEcdh.publicKey,
            decoderNonce,
            decoderPublicKey: decoderEcdh.publicKey,
          });
        }

        // send response
        return reply.status(200).send(returnInitValues);
      }

      // create encoder
      const encoderNonce = getNonce();
      const encoderEcdh = getEcdh();
      const encoderEntropy = encoderEcdh.computeSharedSecret(
        validationResult.data.decoderPublicKey
      );
      instantiateEncoder({
        id: `encoder.${request.clientId}.${request.pairId}`,
        entropy: encoderEntropy,
        nonce: encoderNonce,
        personalization: validationResult.data.decoderPersonalizationStr,
      });

      // create decoder
      const decoderNonce = getNonce();
      const decoderEcdh = getEcdh();
      const decoderEntropy = decoderEcdh.computeSharedSecret(
        validationResult.data.encoderPublicKey
      );
      instantiateDecoder({
        id: `decoder.${request.clientId}.${request.pairId}`,
        entropy: decoderEntropy,
        nonce: decoderNonce,
        personalization: validationResult.data.encoderPersonalizationStr,
      });

      // send response
      reply.status(200).send({
        encoderNonce,
        encoderPublicKey: encoderEcdh.publicKey,
        decoderNonce,
        decoderPublicKey: decoderEcdh.publicKey,
      });
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

  done();
};

/**
 * Public API Routes
 */
export const anonymousApiRoutes: FastifyPluginCallback<{}> = (
  fastify,
  _options,
  done
) => {
  // echo endpoint
  fastify.get("/api/mte-echo/:msg?", (request, reply) => {
    reply.send({
      // @ts-ignore
      echo: request.params?.msg || true,
      time: Date.now(),
    });
  });

  fastify.get("/api/mte-errors", (request, reply) => {
    reply.send(MTE_ERRORS);
  });

  // HEAD /api/mte-relay
  fastify.head("/api/mte-relay", (_request, reply) => {
    reply.status(200).send();
  });

  done();
};
