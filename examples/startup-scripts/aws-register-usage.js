const {
  MarketplaceMeteringClient,
  RegisterUsageCommand,
} = require("@aws-sdk/client-marketplace-metering"); // CommonJS import

const client = new MarketplaceMeteringClient(config);

const input = {
  // RegisterUsageRequest
  ProductCode: "STRING_VALUE", // required
  PublicKeyVersion: Number("int"), // required
  Nonce: "STRING_VALUE",
};

const command = new RegisterUsageCommand(input);
const response = await client.send(command);

// { // RegisterUsageResult
//   PublicKeyRotationTimestamp: new Date("TIMESTAMP"),
//   Signature: "STRING_VALUE",
// };
