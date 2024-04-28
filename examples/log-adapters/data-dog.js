// https://github.com/theogravity/pino-datadog-transport

module.exports = async function (isDebug) {
  return {
    transport: {
      level: isDebug ? "debug" : "info",
      target: "pino-datadog-transport",
      options: {
        ddServerConf: {
          site: "____DATADOG_SITE____", // example: "us5.datadoghq.com"
        },
        ddClientConf: {
          authMethods: {
            apiKeyAuth: "____API_KEY____", // example: "94b631f364251be0b6b7813bab738bad"
          },
        },
        ddsource: "nodejs",
        service: "mte-relay-server",
      },
    },
  };
};
