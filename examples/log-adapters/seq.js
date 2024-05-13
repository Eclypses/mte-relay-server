// https://github.com/autotelic/pino-seq-transport

module.exports = async function () {
  return {
    transport: {
      target: "@autotelic/pino-seq-transport",
      options: {
        loggerOpts: {
          serverUrl: "http://localhost:5341",
        },
      },
    },
  };
};
