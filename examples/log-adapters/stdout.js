// https://github.com/pinojs/pino-pretty

module.exports = async function () {
  return {
    level: "info",
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname",
      },
    },
  };
};
