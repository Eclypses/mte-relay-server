import { FastifyRequest, FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { getEcdh } from "../utils/ecdh";
import { createMteEncoder, createMteDecoder } from "mte-helpers";
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
          return reply
            .status(400)
            .send(JSON.stringify(validationResult.error, null, 2));
        }

        // create encoder
        const encoderNonce = getNonce();
        const encoderEcdh = getEcdh();
        const encoderEntropy = encoderEcdh.computeSharedSecret(
          validationResult.data.decoderPublicKey
        );
        createMteEncoder({
          id: `encoder_${request.sessionId}`,
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
        createMteDecoder({
          id: `decoder_${request.sessionId}`,
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
        console.log(error);
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
  options: {
    accessToken: string;
    companyName: string;
  },
  done: any
) {
  // echo endpoint
  fastify.get(
    "/api/echo/:msg",
    (
      request: FastifyRequest<{ Params: { msg: string } }>,
      reply: FastifyReply
    ) => {
      reply.send({
        echo: request.params.msg,
        time: Date.now(),
      });
    }
  );

  // HEAD /api/mte-relay
  fastify.head(
    "/api/mte-relay",
    (request: FastifyRequest, reply: FastifyReply) => {
      reply.status(200).send();
    }
  );

  // generate an MTE report and download it
  fastify.get<{
    Params: { accessToken: string };
    Querystring: { month?: string; year?: string };
  }>(`/api/mte-report/:accessToken`, async (request, reply) => {
    // validate token
    if (request.params.accessToken !== options.accessToken) {
      return reply.status(404).send();
    }

    // parse and validate month and year query params
    const date = new Date();
    let month = date.getMonth();
    if (request.query.month) {
      try {
        const number = parseInt(request.query.month);
        if (isNaN(number)) {
          return reply
            .status(400)
            .send("Invalid month. Select a month, 0 - 11.");
        }
        if (number < 0 || number > 11) {
          return reply
            .status(400)
            .send("Invalid month. Select a month, 0 - 11.");
        }
        month = number;
      } catch (err: any) {
        // console.error(`Failed to parse month. Error: ${err.message}`);
      }
    }

    const currentYear = date.getFullYear();
    let year = currentYear;
    if (request.query.year) {
      try {
        const number = parseInt(request.query.year);
        if (isNaN(number)) {
          return reply
            .status(400)
            .send(`Invalid year. Example: year=${currentYear}`);
        }
        year = number;
      } catch (err: any) {
        console.error(`Failed to parse year. Error: ${err.message}`);
      }
    }

    const mteClientsThisMonth = await request.getTotalClientsByMonth(
      month,
      year
    );
    const totalMteRequestsThisMonth = await request.getTotalMteUseCountByMonth(
      month,
      year
    );

    // check if the month is complete
    const isMonthComplete = (() => {
      if (year < currentYear) {
        return true;
      }
      if (year === currentYear) {
        if (month < date.getMonth()) {
          return true;
        }
      }
      return false;
    })();

    return reply.send({
      title: "MTE Usage Report",
      companyName: options.companyName,
      month: month,
      monthName: getMonthName(month),
      year: year,
      mteClientsThisMonth,
      totalMteRequestsThisMonth,
      dateGeneratedISO: new Date().toISOString(),
      isMonthComplete,
    });
  });

  done();
}

function getMonthName(month: number) {
  try {
    const arrayOfMonths = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    return arrayOfMonths[month];
  } catch (error) {
    return "Unknown";
  }
}
