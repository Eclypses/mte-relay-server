import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import crypto from "crypto";

import { anonymousApiRoutes, protectedApiRoutes } from "./modules/api";
import getLogSettings from "./modules/log";
import proxy from "./modules/proxy";
import headers from "./modules/headers";
import mteInit from "./modules/mte-init";
import settings from "./modules/settings";
import passThrough from "./modules/pass-through";
import mteIdManager from "./modules/mte-id-manager";
import { startupChecks } from "./modules/startup-checks";

let server: FastifyInstance | null = null;

// start server
(async () => {
  try {
    const SETTINGS = await settings();

    // startup checks
    await startupChecks();

    // create fastify server instance
    server = Fastify({
      logger: await getLogSettings(),
      genReqId: () => crypto.randomUUID(),
    });

    // Register MTE init module
    await server.register(mteInit, {
      licenseCompany: SETTINGS.LICENSE_COMPANY,
      licenseKey: SETTINGS.LICENSE_KEY,
      maxPoolSize: SETTINGS.MAX_POOL_SIZE,
    });

    // Register cors plugins
    await server.register(cors, {
      origin: SETTINGS.CORS_ORIGINS,
      methods: SETTINGS.CORS_METHODS,
      credentials: true,
      exposedHeaders: [
        SETTINGS.CLIENT_ID_HEADER,
        SETTINGS.PAIR_ID_HEADER,
        SETTINGS.ENCODED_HEADERS_HEADER,
        SETTINGS.ENCODER_TYPE_HEADER,
      ],
    });

    // register custom headers, if they exist
    await server.register(headers, {
      headers: SETTINGS.HEADERS as Record<string, string>,
    });

    // Register MTE ID manager module
    await server.register(mteIdManager, {
      clientIdSecret: SETTINGS.CLIENT_ID_SECRET,
      clientIdHeader: SETTINGS.CLIENT_ID_HEADER,
      pairIdHeader: SETTINGS.PAIR_ID_HEADER,
      mteServerId: SETTINGS.SERVER_ID,
      encoderTypeHeader: SETTINGS.ENCODER_TYPE_HEADER,
    });

    // register anonymous API routes
    await server.register(anonymousApiRoutes);

    // register protected API routes
    await server.register(protectedApiRoutes, {
      clientIdHeader: SETTINGS.CLIENT_ID_HEADER,
    });

    // register pass-through routes
    await server.register(passThrough, {
      routes: SETTINGS.PASS_THROUGH_ROUTES,
      upstream: SETTINGS.UPSTREAM,
    });

    // register proxy
    await server.register(proxy, {
      upstream: SETTINGS.UPSTREAM,
      httpMethods: SETTINGS.CORS_METHODS,
      tempDirPath: SETTINGS.TEMP_DIR_PATH,
      clientIdHeader: SETTINGS.CLIENT_ID_HEADER,
      pairIdHeader: SETTINGS.PAIR_ID_HEADER,
      encodedHeadersHeader: SETTINGS.ENCODED_HEADERS_HEADER,
      routes: SETTINGS.MTE_ROUTES,
      encoderTypeHeader: SETTINGS.ENCODER_TYPE_HEADER,
    });

    await server.listen({ port: SETTINGS.PORT, host: "0.0.0.0" });
    console.log(`Server listening on port ${SETTINGS.PORT}`);
  } catch (err) {
    console.log(err);
    server?.log.error(err);
    process.exit(1);
  }
})();
