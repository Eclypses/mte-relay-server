/**
 * Integrate with AWS Marketplace Metering Service
 *   - https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/marketplace-metering/
 *   - https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/marketplace-metering/command/RegisterUsageCommand/
 *
 * npm i @aws-sdk/client-marketplace-metering
 */

const {
  MarketplaceMeteringClient,
  RegisterUsageCommand,
} = require("@aws-sdk/client-marketplace-metering");

module.exports = async function () {
  const config = {};
  const client = new MarketplaceMeteringClient(config);

  const command = new RegisterUsageCommand({
    ProductCode: "STRING_VALUE", // required
    PublicKeyVersion: Number("int"), // required
  });

  await client.send(command);
};
