import yaml from "yaml";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { z } from "zod";

// where to store sqlite3 db, and tmp/
const persistentDir = path.join(process.cwd(), "data");

// default settings
const DEFAULT_OPTIONS = {
  SERVER_ID: crypto.randomUUID(),
  CLIENT_ID_HEADER: `x-mte-relay-client-id`,
  PAIR_ID_HEADER: `x-mte-relay-pair-id`,
  ENCODED_HEADERS_HEADER: `x-mte-relay-eh`,
  ENCODER_TYPE_HEADER: "x-mte-relay-et",
  PORT: 8080,
  DEBUG: false,
  PERSISTENT_DIR: persistentDir,
  TEMP_DIR_PATH: path.join(persistentDir, "tmp"),
  MAX_POOL_SIZE: 25,
};

// schema for validating settings passed into server
const settingsSchema = z.object({
  upstream: z.string().url({ message: "upstream must be a valid URL." }),
  licenseCompany: z.string(),
  licenseKey: z.string(),
  clientIdSecret: z.string(),
  corsOrigins: z.array(z.string().url({ message: "corsOrigin must be a valid URL." })),
  port: z.number().optional(),
  debug: z.boolean().optional(),
  passThroughRoutes: z.array(z.string()).optional(),
  corsMethods: z.array(z.string()).optional(),
  outboundProxyBearerToken: z.string().optional(),
  maxFormDataSize: z.number().optional(),
  headers: z.object({}).passthrough().optional(),
  mteRoutes: z.array(z.string()).optional(),
  serverId: z.string().optional(),
  maxPoolSize: z.number().min(1).optional(),
});

// default function for generating settings
export default async function () {
  let _settings = null;

  const flagIndex = process.argv.indexOf("--settings-adapter");
  if (flagIndex > -1) {
    // Get the file path after the flag
    const filePath = process.argv[flagIndex + 1];
    try {
      // Dynamically import the module
      const getSettings = await import(filePath);
      _settings = await getSettings.default();
    } catch (error) {
      console.log(`Failed to load settings file: ${filePath}`);
      console.log(error);
      process.exit(1);
    }
  } else {
    // by default, parse a yaml file
    const yamlPath = path.join(process.cwd(), "mte-relay-config.yaml");
    const file = fs.readFileSync(yamlPath, { encoding: "utf-8" });
    _settings = yaml.parse(file);
  }

  // validate user provided settings
  const userSettings = settingsSchema.parse(_settings);

  // map user settings to app settings object
  const _userSettings = {
    PORT: userSettings.port || DEFAULT_OPTIONS.PORT,
    UPSTREAM: userSettings.upstream,
    LICENSE_COMPANY: userSettings.licenseCompany,
    LICENSE_KEY: userSettings.licenseKey,
    CORS_ORIGINS: userSettings.corsOrigins,
    CLIENT_ID_SECRET: userSettings.clientIdSecret,
    DEBUG: userSettings.debug || DEFAULT_OPTIONS.DEBUG,
    OUTBOUND_PROXY_BEARER_TOKEN: userSettings.outboundProxyBearerToken,
    PASS_THROUGH_ROUTES: userSettings.passThroughRoutes || [],
    HEADERS: userSettings.headers,
    MTE_ROUTES: userSettings.mteRoutes,
    SERVER_ID: userSettings.serverId || DEFAULT_OPTIONS.SERVER_ID,
    MAX_POOL_SIZE: userSettings.maxPoolSize || DEFAULT_OPTIONS.MAX_POOL_SIZE,
  };

  // SET CORs methods
  const _corsMethods = (() => {
    const required = [`OPTIONS`, `HEAD`];
    const defaults = [`GET`, `POST`, `PUT`, `DELETE`];
    if (userSettings.corsMethods) {
      return [...required, ...userSettings.corsMethods];
    }
    return [...required, ...defaults];
  })();

  return {
    ...DEFAULT_OPTIONS,
    ..._userSettings,
    CORS_METHODS: _corsMethods,
  } as const;
}
