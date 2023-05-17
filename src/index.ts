import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";

import { anonymousApiRoutes, protectedApiRoutes } from "./modules/api";
import proxy from "./modules/proxy";
import sqlite from "./modules/sqlite";
import mteInit from "./modules/mte-init";
import SETTINGS from "./modules/settings";
import passThrough from "./modules/pass-through";
import mteIdManager from "./modules/mte-id-manager";
import { startupChecks } from "./modules/startup-checks";

let server: FastifyInstance | null = null;

// start server
(async () => {
  try {
    // startup checks
    await startupChecks();

    // create fastify server instance
    server = Fastify();

    // Register MTE init module
    await server.register(mteInit, {
      redisUrl: SETTINGS.REDIS_URL,
      licenseCompany: SETTINGS.LICENSE_COMPANY,
      licenseKey: SETTINGS.LICENSE_KEY,
    });

    // Register sqlite module
    await server.register(sqlite, {
      location: SETTINGS.PERSISTENT_DIR,
    });

    // Register cors plugins
    await server.register(cors, {
      origin: SETTINGS.CORS_ORIGINS,
      methods: SETTINGS.CORS_METHODS,
      credentials: true,
      exposedHeaders: [SETTINGS.SERVER_ID_HEADER, SETTINGS.CLIENT_ID_HEADER],
    });

    // Register MTE ID manager module
    await server.register(mteIdManager, {
      clientIdSecret: SETTINGS.CLIENT_ID_SECRET,
      clientIdHeader: SETTINGS.CLIENT_ID_HEADER,
      sessionIdHeader: SETTINGS.SESSION_ID_HEADER,
      serverIdHeader: SETTINGS.SERVER_ID_HEADER,
      mteServerId: SETTINGS.SERVER_ID,
    });

    // register anonymous api routes
    await server.register(anonymousApiRoutes, {
      accessToken: SETTINGS.GENERATE_MTE_REPORT_ACCESS_TOKEN,
      companyName: SETTINGS.LICENSE_COMPANY,
    });

    // register protected api routes
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
      repairCode: SETTINGS.REPAIR_REQUIRED_HTTP_CODE,
      tempDirPath: SETTINGS.TEMP_DIR_PATH,
      clientIdHeader: SETTINGS.CLIENT_ID_HEADER,
      maxFormDataSize: SETTINGS.MAX_FORM_DATA_SIZE,
      sessionIdHeader: SETTINGS.SESSION_ID_HEADER,
      encodedHeadersHeader: SETTINGS.ENCODED_HEADERS_HEADER,
    });

    await server.listen({ port: SETTINGS.PORT, host: "0.0.0.0" });
    console.log("Server listening on: http://localhost:" + SETTINGS.PORT);
  } catch (err) {
    console.log(err);
    server?.log.error(err);
    process.exit(1);
  }
})();
