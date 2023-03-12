import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";

import api from "./modules/api";
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
      exposedHeaders: [
        SETTINGS.MTE_SERVER_ID_HEADER,
        SETTINGS.MTE_ENCODED_CONTENT_TYPE_HEADER_NAME,
      ],
    });

    // Register MTE ID manager module
    await server.register(mteIdManager, {
      cookieSecret: SETTINGS.COOKIE_SECRET,
      cookieName: SETTINGS.COOKIE_NAME,
      mteClientIdHeader: SETTINGS.MTE_CLIENT_ID_HEADER,
      mteServerIdHeader: SETTINGS.MTE_SERVER_ID_HEADER,
      mteServerId: SETTINGS.MTE_RELAY_SERVER_ID,
    });

    // register api routes
    await server.register(api, {
      accessToken: SETTINGS.GENERATE_MTE_REPORT_ACCESS_TOKEN,
      companyName: SETTINGS.LICENSE_COMPANY,
    });

    // register pass-through routes
    await server.register(passThrough, {
      routes: SETTINGS.PASS_THROUGH_ROUTES,
      upstream: SETTINGS.HOST,
    });

    // register proxy
    await server.register(proxy, {
      upstream: SETTINGS.HOST,
      httpMethods: SETTINGS.CORS_METHODS,
      contentTypeHeader: SETTINGS.MTE_ENCODED_CONTENT_TYPE_HEADER_NAME,
      repairCode: SETTINGS.REPAIR_REQUIRED_HTTP_CODE,
      tempDirPath: SETTINGS.TEMP_DIR_PATH,
    });

    await server.listen({ port: SETTINGS.PORT });
    console.log("Server listening on: http://localhost:" + SETTINGS.PORT);
  } catch (err) {
    console.log(err);
    server?.log.error(err);
    process.exit(1);
  }
})();
