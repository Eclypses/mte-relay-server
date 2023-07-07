import { FastifyInstance } from "fastify";
import fastifyPlugin from "fastify-plugin";
import crypto from "crypto";
import { signAString, verifySignedString } from "../utils/signed-ids";

// extend FastifyRequest interface with decorator method
declare module "fastify" {
  interface FastifyRequest {
    clientId: null | string;
    sessionId: null | string;
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
async function mteIdManager(
  fastify: FastifyInstance,
  options: {
    clientIdSecret: string;
    clientIdHeader: string;
    sessionIdHeader: string;
    serverIdHeader: string;
    mteServerId: string;
  },
  done: any
) {
  // decorate request object with clientId
  fastify.decorateRequest("clientId", null);
  fastify.decorateRequest("sessionId", null);

  // on every request
  fastify.addHook("onRequest", (request, reply, done) => {
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
        // TODO: Return MTE-Relay status code so the client can try again without including this header (which will assign them a new header).
        return reply
          .code(400)
          .send(`Invalid header: ${options.clientIdHeader}`);
      }
      clientId = verified;
    }

    // log client ID
    request.log.info(
      { [options.clientIdHeader]: clientId },
      options.clientIdHeader
    );

    // set x-mte-relay-client-id header on every response
    const signedClientId = signAString(clientId, options.clientIdSecret);
    reply.header(options.clientIdHeader, signedClientId);

    // use x-mte-relay-client-id header to decorate request object with clientId
    request.clientId = clientId;

    // session ID is clientId OR clientId.sessionId
    request.sessionId = request.clientId;
    const sessionId = request.headers[options.sessionIdHeader] as string;
    if (sessionId) {
      request.sessionId += `.${sessionId}`;
      reply.header(options.sessionIdHeader, sessionId);
    }

    done();
  });

  done();
}

export default fastifyPlugin(mteIdManager);
