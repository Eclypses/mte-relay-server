import { FastifyBaseLogger } from "fastify";
import path from "path";

export default async function (isDebug: boolean) {
  // dynamically inject logger from consumer, if it exists
  const flagIndex = process.argv.indexOf("--log-adapter");
  if (flagIndex > -1) {
    // Get the file path after the flag
    const filePath = process.argv[flagIndex + 1];
    try {
      // Dynamically import the module
      const logAdapter = await import(filePath);
      const transport = await logAdapter.default(isDebug);
      return transport;
    } catch (error) {
      console.error(`Failed to load log adapter: ${filePath}`);
      console.error(error);
      process.exit(1);
    }
  }

  // else, use default logger
  const logPath = path.join(process.cwd(), "data", "mte-relay-server.log");
  console.log(`Log - ${logPath}`);
  return {
    transport: {
      target: "pino/file",
      options: {
        destination: logPath,
      },
    },
  };
}

let log: FastifyBaseLogger;
export function setLogger(logger: FastifyBaseLogger) {
  log = logger;
}
export function getLogger() {
  return log;
}
