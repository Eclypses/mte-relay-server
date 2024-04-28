// https://github.com/pinojs/pino-pretty

module.exports = async function (isDebug) {
  return {
    level: isDebug ? "debug" : "info",
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname",
      },
    },
  };
};
