// https://www.npmjs.com/package/@serdnam/pino-cloudwatch-transport

/**
 * Requires AWS SDK v3
 * npm i @aws-sdk/client-cloudwatch-logs
 * npm i @serdnam/pino-cloudwatch-transport
 */
module.exports = async function () {
  return {
    transport: {
      target: "@serdnam/pino-cloudwatch-transport",
      options: {
        logGroupName: "log-group-name",
        logStreamName: "log-stream-name",
        awsRegion: process.env.AWS_REGION,
        awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
        awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    },
  };
};
