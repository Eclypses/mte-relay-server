import { FastifyInstance } from "fastify";
import fastifyPlugin from "fastify-plugin";
import cookie from "@fastify/cookie";
import crypto from "crypto";

// extend FastifyRequest interface with decorator method
declare module "fastify" {
  interface FastifyRequest {
    clientId: null | string;
    sessionId: null | string;
  }
}

/**
 * - Add MTE Server ID to every reply
 * - Set/Refresh MTE Client ID cookie on every request
 * - Decorate every request with "clientId" property
 *    - clientId = MTE Client ID cookie
 *    - sessionId = MTE Client ID cookie + MTE Client ID header
 *        - sessionId allows new Encoder/Decoders for each separate tab/window of a website user
 */
async function mteIdManager(
  fastify: FastifyInstance,
  options: {
    cookieSecret: string;
    cookieName: string;
    mteClientIdHeader: string;
    mteServerIdHeader: string;
    mteServerId: string;
  },
  done: any
) {
  // register cookie plugin
  fastify.register(cookie, {
    secret: options.cookieSecret,
    parseOptions: {
      signed: true,
      secure: true,
      httpOnly: true,
      sameSite: "none",
    },
  });

  // decorate request object with clientId
  fastify.decorateRequest("clientId", null);

  // on every request
  fastify.addHook("onRequest", (request, reply, done) => {
    // add server ID header to the response
    // allows client can track the different MTE Relay servers it talks to
    reply.header(options.mteServerIdHeader, options.mteServerId);

    // create clientId by combining HttpOnly cookie with clientId header
    const clientIdHeader = request.headers[options.mteClientIdHeader];
    if (!clientIdHeader) {
      return reply
        .code(400)
        .send(`Missing ${options.mteClientIdHeader} header.`);
    }

    const existingCookie = request.cookies[options.cookieName];
    let _id = null;
    if (existingCookie) {
      // validate cookie
      const unsigned = fastify.unsignCookie(existingCookie);
      if (!unsigned.valid || !unsigned.value) {
        reply.clearCookie(options.cookieName, { path: "/" });
        return reply.code(400).send("Invalid cookie");
      }
      _id = unsigned.value;
    }

    // if no existing cookie, create new one
    const id = _id || crypto.randomUUID();

    // create expiration date
    const expiresDate = new Date();
    expiresDate.setDate(expiresDate.getDate() + 31); // 31 days

    // set cookie
    reply.setCookie(options.cookieName, id, {
      signed: true,
      secure: true,
      path: "/",
      expires: expiresDate,
    });

    // decorate request object with "clientId" property
    request.clientId = id;
    request.sessionId = id + "|" + clientIdHeader;

    done();
  });

  done();
}

export default fastifyPlugin(mteIdManager);
