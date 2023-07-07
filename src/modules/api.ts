import { FastifyRequest, FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { getEcdh } from "../utils/ecdh";
import { instantiateEncoder, instantiateDecoder } from "./mte";
import { getNonce } from "../utils/nonce";

/**
 * Protect API Routes that require x-mte-id header
 */
export function protectedApiRoutes(
  fastify: FastifyInstance,
  options: {
    clientIdHeader: string;
  },
  done: any
) {
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
  fastify.post(
    "/api/mte-pair",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // validate request body
        const validationResult = mtePairSchema.safeParse(request.body);
        if (!validationResult.success) {
          request.log.error(validationResult.error);
          return reply
            .status(400)
            .send(JSON.stringify(validationResult.error, null, 2));
        }

        // create encoder
        const encoderNonce = getNonce();
        request.log.debug("encoder nonce", encoderNonce);
        request.log.debug(
          "encoder personalization",
          validationResult.data.decoderPersonalizationStr
        );
        const encoderEcdh = getEcdh();
        const encoderEntropy = encoderEcdh.computeSharedSecret(
          validationResult.data.decoderPublicKey
        );
        request.log.debug("encoderEntropy", encoderEntropy.toString());
        instantiateEncoder({
          id: `encoder.${request.sessionId}`,
          entropy: encoderEntropy,
          nonce: encoderNonce,
          personalization: validationResult.data.decoderPersonalizationStr,
        });

        // create decoder
        const decoderNonce = getNonce();
        request.log.debug("decoder nonce", decoderNonce);
        request.log.debug(
          "decoder personalization",
          validationResult.data.encoderPersonalizationStr
        );
        const decoderEcdh = getEcdh();
        const decoderEntropy = decoderEcdh.computeSharedSecret(
          validationResult.data.encoderPublicKey
        );
        request.log.debug("decoderEntropy", decoderEntropy.toString());
        instantiateDecoder({
          id: `decoder.${request.sessionId}`,
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
        reply.status(500).send({ error: (error as Error).message });
      }
    }
  );

  done();
}

/**
 * Public API Routes
 */
export function anonymousApiRoutes(
  fastify: FastifyInstance,
  _options: {},
  done: any
) {
  // echo endpoint
  fastify.get(
    "/api/echo/:msg?",
    (
      request: FastifyRequest<{ Params: { msg: string } }>,
      reply: FastifyReply
    ) => {
      reply.send({
        echo: request.params.msg || true,
        time: Date.now(),
      });
    }
  );

  // HEAD /api/mte-relay
  fastify.head(
    "/api/mte-relay",
    (_request: FastifyRequest, reply: FastifyReply) => {
      reply.status(200).send();
    }
  );

  done();
}
