// https://github.com/pinojs/pino/blob/master/docs/transports.md#pinofile

const path = require("path");

module.exports = async function () {
  return {
    transport: {
      target: "pino/file",
      options: {
        destination: path.join(process.cwd(), "data/custom-log.log"),
      },
    },
  };
};
