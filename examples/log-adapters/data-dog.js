// https://github.com/theogravity/pino-datadog-transport

module.exports = async function () {
  return {
    transport: {
      level: "info",
      target: "pino-datadog-transport",
      options: {
        ddServerConf: {
          site: "us5.datadoghq.com",
        },
        ddClientConf: {
          authMethods: {
            apiKeyAuth: "____API_KEY____",
          },
        },
        ddsource: "nodejs",
        service: "mte-relay-server",
      },
    },
  };
};
