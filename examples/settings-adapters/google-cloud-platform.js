/**
 * Pull in settings as JSON from Google Cloud secret manager
 *
 * Dependencies:
 *  - npm i @google-cloud/secret-manager
 */

const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");

module.exports = async function () {
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: process.env.SECRETS_NAME,
  });
  const json = version.payload.data.toString();
  const settings = JSON.parse(json);
  return settings;
};
