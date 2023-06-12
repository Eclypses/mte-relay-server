import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import crypto from "crypto";

import { anonymousApiRoutes, protectedApiRoutes } from "./modules/api";
import proxy from "./modules/proxy";
import sqlite from "./modules/sqlite";
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
      logger: SETTINGS.DEBUG,
      genReqId: () => crypto.randomUUID(),
    });

    // Register MTE init module
    await server.register(mteInit, {
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
        SETTINGS.SERVER_ID_HEADER,
        SETTINGS.CLIENT_ID_HEADER,
        SETTINGS.SESSION_ID_HEADER,
        SETTINGS.ENCODED_HEADERS_HEADER,
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
      tempDirPath: SETTINGS.TEMP_DIR_PATH,
      clientIdHeader: SETTINGS.CLIENT_ID_HEADER,
      maxFormDataSize: SETTINGS.MAX_FORM_DATA_SIZE,
      sessionIdHeader: SETTINGS.SESSION_ID_HEADER,
      encodedHeadersHeader: SETTINGS.ENCODED_HEADERS_HEADER,
      routes: SETTINGS.MTE_ROUTES,
    });

    await server.listen({ port: SETTINGS.PORT, host: "0.0.0.0" });
    console.log("Server listening on: http://localhost:" + SETTINGS.PORT);
  } catch (err) {
    console.log(err);
    server?.log.error(err);
    process.exit(1);
  }
})();
