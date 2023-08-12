// https://github.com/pinojs/pino-pretty

module.exports = async function () {
  return {
    level: "debug",
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname",
      },
    },
  };
};
