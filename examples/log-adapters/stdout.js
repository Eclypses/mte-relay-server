// https://github.com/pinojs/pino-pretty

module.exports = async function () {
  return {
    transport: {
      target: "pino-pretty",
      level: "debug",
      options: {
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname",
      },
    },
  };
};
