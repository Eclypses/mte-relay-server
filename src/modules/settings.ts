import yaml from "yaml";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { z } from "zod";

/**
 * Settings Module
 * Read a yaml file and export immutable values for the program to use.
 */

// parse yaml file
const yamlPath = path.join(process.cwd(), "mte-relay-config.yaml");
const file = fs.readFileSync(yamlPath, { encoding: "utf-8" });
const parsedYaml = yaml.parse(file);

// where to store sqlite3 db, and tmp/
const persistentDir = path.join(process.cwd(), "data");

// validate yaml file
const yamlSchema = z.object({
  upstream: z.string().url({ message: "upstream must be a valid URL." }),
  licenseCompany: z.string(),
  licenseKey: z.string(),
  clientIdSecret: z.string(),
  corsOrigins: z.array(
    z.string().url({ message: "corsOrigin must be a valid URL." })
  ),
  reportAccessToken: z.string(),
  port: z.number().optional(),
  debug: z.boolean().optional(),
  passThroughRoutes: z.array(z.string()).optional(),
  corsMethods: z.array(z.string()).optional(),
  redisConnectionString: z.string().optional(),
  outboundProxyBearerToken: z.string().optional(),
  maxFormDataSize: z.number().optional(),
});

// validate yaml file has everything needed
const validatedYaml = yamlSchema.parse(parsedYaml);

// export values for program to use
export default {
  SERVER_ID: crypto.randomUUID(),
  SERVER_ID_HEADER: `x-mte-relay-server-id`,
  CLIENT_ID_HEADER: `x-mte-relay-client-id`,
  SESSION_ID_HEADER: `x-mte-relay-session-id`,
  ENCODED_HEADERS_HEADER: `x-mte-relay-eh`,
  PORT: validatedYaml.port || 8080,
  UPSTREAM: validatedYaml.upstream,
  LICENSE_COMPANY: validatedYaml.licenseCompany,
  LICENSE_KEY: validatedYaml.licenseKey,
  CORS_ORIGINS: validatedYaml.corsOrigins,
  CORS_METHODS: (() => {
    const required = [`OPTIONS`, `HEAD`];
    const defaults = [`GET`, `POST`, `PUT`, `DELETE`];
    if (validatedYaml.corsMethods) {
      return [...required, ...validatedYaml.corsMethods];
    }
    return [...required, ...defaults];
  })(),
  CLIENT_ID_SECRET: validatedYaml.clientIdSecret,
  GENERATE_MTE_REPORT_ACCESS_TOKEN: validatedYaml.reportAccessToken,
  REDIS_URL: validatedYaml.redisConnectionString,
  DEBUG: validatedYaml.debug || false,
  REPAIR_REQUIRED_HTTP_CODE: 559,
  TEMP_DIR_PATH: path.join(persistentDir, "tmp"),
  OUTBOUND_PROXY_BEARER_TOKEN: validatedYaml.outboundProxyBearerToken,
  PASS_THROUGH_ROUTES: validatedYaml.passThroughRoutes || [],
  PERSISTENT_DIR: persistentDir,
  MAX_FORM_DATA_SIZE: validatedYaml.maxFormDataSize || 1024 * 1024 * 20, // 20mb
} as const;
