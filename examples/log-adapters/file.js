// https://github.com/pinojs/pino/blob/master/docs/transports.md#pinofile

const path = require("path");

module.exports = async function (isDebug) {
  return {
    level: isDebug ? "debug" : "info",
    transport: {
      target: "pino/file",
      options: {
        destination: path.join(process.cwd(), "data/mte-relay.log"),
      },
    },
  };
};
