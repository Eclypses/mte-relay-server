import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import crypto from "crypto";

import settings from "./modules/settings";
import { startupChecks } from "./modules/startup-checks";
import getLogSettings from "./modules/log";
import mteInit from "./modules/mte-init";
import headers from "./modules/headers";
import { publicRoutes } from "./modules/public-routes";
import proxy from "./modules/proxy";
import { mtePairRoutes } from "./modules/api";

let server: FastifyInstance | null = null;

// start server
(async () => {
  try {
    // get settings
    const SETTINGS = await settings();

    // startup checks
    await startupChecks();

    // create fastify server instance
    server = Fastify({
      logger: await getLogSettings(),
      genReqId: () => crypto.randomUUID(),
    });

    // Register cors plugins
    await server.register(cors, {
      origin: SETTINGS.CORS_ORIGINS,
      methods: SETTINGS.CORS_METHODS,
      credentials: true,
      exposedHeaders: [
        SETTINGS.ENCODED_HEADERS_HEADER,
        SETTINGS.MTE_RELAY_HEADER,
      ],
    });

    // Register MTE init module
    await server.register(mteInit, {
      licenseCompany: SETTINGS.LICENSE_COMPANY,
      licenseKey: SETTINGS.LICENSE_KEY,
      maxPoolSize: SETTINGS.MAX_POOL_SIZE,
    });

    // register custom headers, if they exist
    await server.register(headers, {
      headers: SETTINGS.HEADERS as Record<string, string>,
    });

    // register non-MTE routes
    server.register(publicRoutes, {
      routes: SETTINGS.PASS_THROUGH_ROUTES,
      upstream: SETTINGS.UPSTREAM,
    });

    // register protected API routes
    await server.register(mtePairRoutes, {
      mteRelayHeader: SETTINGS.MTE_RELAY_HEADER,
      clientIdSecret: SETTINGS.CLIENT_ID_SECRET,
    });

    // register proxy
    await server.register(proxy, {
      upstream: SETTINGS.UPSTREAM,
      httpMethods: SETTINGS.CORS_METHODS,
      tempDirPath: SETTINGS.TEMP_DIR_PATH,
      encodedHeadersHeader: SETTINGS.ENCODED_HEADERS_HEADER,
      routes: SETTINGS.MTE_ROUTES,
      mteRelayHeader: SETTINGS.MTE_RELAY_HEADER,
      clientIdSecret: SETTINGS.CLIENT_ID_SECRET,
    });

    await server.listen({ port: SETTINGS.PORT, host: "0.0.0.0" });
    console.log(`Server listening on port ${SETTINGS.PORT}`);
  } catch (err) {
    console.log(err);
    server?.log.error(err);
    process.exit(1);
  }
})();
