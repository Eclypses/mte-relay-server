import yaml from "yaml";
import fs from "fs";
import path from "path";
import { objectOutputType, z, ZodTypeAny } from "zod";

type Settings = {
  ENCODED_HEADERS_HEADER: string;
  MTE_RELAY_HEADER: string;
  PORT: number;
  DEBUG: boolean;
  PUBLIC_DIR: string;
  MAX_POOL_SIZE: number;
  UPSTREAM: string;
  LICENSE_COMPANY: string;
  LICENSE_KEY: string;
  CLIENT_ID_SECRET: string;
  CORS_ORIGINS: string[];
  CORS_METHODS: string[];
  PASS_THROUGH_ROUTES: string[];
  SECRET: string;
  OUTBOUND_TOKEN?: string;
  OUTBOUND_TOKEN_HEADER: string;
  OUTBOUND_UPSTREAM_HEADER: string;
  OUTBOUND_ENCODE_TYPE_HEADER: string;
  OUTBOUND_ENCODE_HEADERS_HEADER: string;
  OUTBOUND_ENCODE_URL_HEADER: string;
  HEADERS?: objectOutputType<{}, ZodTypeAny, "passthrough">;
  MTE_ROUTES?: string[];
  LOG_LEVEL: string;
};

// default function for generating settings
let _settings: null | Settings = null;
export async function getRelaySettings() {
  if (_settings !== null) {
    return _settings;
  }
  // public dir for static assets
  const publicDir = path.join(process.cwd(), "public");

  // default settings
  const DEFAULT_OPTIONS = {
    ENCODED_HEADERS_HEADER: `x-mte-relay-eh`,
    MTE_RELAY_HEADER: "x-mte-relay",
    OUTBOUND_TOKEN_HEADER: "x-mte-outbound-token",
    OUTBOUND_UPSTREAM_HEADER: "x-mte-upstream",
    OUTBOUND_ENCODE_TYPE_HEADER: "x-mte-encode-type",
    OUTBOUND_ENCODE_HEADERS_HEADER: "x-mte-encode-headers",
    OUTBOUND_ENCODE_URL_HEADER: "x-mte-encode-url",
    PORT: 8080,
    SECRET: "",
    DEBUG: false,
    LOG_LEVEL: "info",
    PUBLIC_DIR: publicDir,
    MAX_POOL_SIZE: 250,
  };

  // schema for validating settings passed into server
  const settingsSchema = z.object({
    upstream: z.string().url({ message: "upstream must be a valid URL." }),
    licenseCompany: z.string(),
    licenseKey: z.string(),
    clientIdSecret: z.string(),
    corsOrigins: z
      .array(z.string().url({ message: "corsOrigin must be a valid URL." }))
      .optional(),
    port: z.number().optional(),
    secret: z.string().optional(),
    debug: z.boolean().optional(),
    passThroughRoutes: z.array(z.string()).optional(),
    corsMethods: z.array(z.string()).optional(),
    outboundToken: z.string().optional(),
    maxFormDataSize: z.number().optional(),
    headers: z.object({}).passthrough().optional(),
    mteRoutes: z.array(z.string()).optional(),
    maxPoolSize: z.number().min(1).optional(),
    logLevel: z.string().optional(),
  });

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
    CORS_ORIGINS: userSettings.corsOrigins || [],
    CLIENT_ID_SECRET: userSettings.clientIdSecret,
    DEBUG: userSettings.debug || DEFAULT_OPTIONS.DEBUG,
    OUTBOUND_TOKEN: userSettings.outboundToken,
    PASS_THROUGH_ROUTES: userSettings.passThroughRoutes || [],
    HEADERS: userSettings.headers,
    MTE_ROUTES: userSettings.mteRoutes,
    MAX_POOL_SIZE: userSettings.maxPoolSize || DEFAULT_OPTIONS.MAX_POOL_SIZE,
    SECRET: userSettings.secret || DEFAULT_OPTIONS.SECRET,
    LOG_LEVEL: userSettings.logLevel || DEFAULT_OPTIONS.LOG_LEVEL,
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

  _settings = {
    ...DEFAULT_OPTIONS,
    ..._userSettings,
    CORS_METHODS: _corsMethods,
  } as const;
  return _settings;
}
