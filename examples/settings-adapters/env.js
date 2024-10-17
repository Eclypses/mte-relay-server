/**
 * Read settings from environment variables.
 *
 * Example ENVs this file reads shown below. You may
 * rename them, but you will need to update the code below as well.
 *
 * UPSTREAM='https://api.my-company.com'
 * LICENSE_COMPANY='My Company, LLC.'
 * LICENSE_KEY='4vHSvWLTRvwx+JoThgT0p0kE'
 * CLIENT_ID_SECRET='2DkV4DDabehO8cifDktdF9elKJL0CKrk'
 * CORS_ORIGINS='https://www.my-company.com,https://dashboard.my-company.com'
 * PORT=3000
 * DEBUG=true
 * PASS_THROUGH_ROUTES='/health,/version'
 * MTE_ROUTES='/api/v1/*,/api/v2/*'
 * CORS_METHODS='GET,POST,DELETE'
 * HEADERS='{"x-service-name":"mte-relay"}'
 * MAX_POOL_SIZE=25
 * OUTBOUND_TOKEN='abcdefg1234567`
 */

module.exports = async function () {
  try {
    const settings = {};

    function addSetting(key, envVar, type = "string") {
      if (process.env[envVar] !== undefined) {
        switch (type) {
          case "array":
            settings[key] = process.env[envVar].split(",");
            break;
          case "number":
            settings[key] = Number(process.env[envVar]);
            break;
          case "boolean":
            settings[key] = process.env[envVar].toLowerCase() === "true";
            break;
          case "json":
            settings[key] = JSON.parse(process.env[envVar]);
            break;
          case "string":
          default:
            settings[key] = process.env[envVar];
        }
      }
    }

    addSetting("upstream", "UPSTREAM");
    addSetting("licenseCompany", "LICENSE_COMPANY");
    addSetting("licenseKey", "LICENSE_KEY");
    addSetting("clientIdSecret", "CLIENT_ID_SECRET");
    addSetting("corsOrigins", "CORS_ORIGINS", "array");
    addSetting("port", "PORT", "number");
    addSetting("debug", "DEBUG", "boolean");
    addSetting("passThroughRoutes", "PASS_THROUGH_ROUTES", "array");
    addSetting("mteRoutes", "MTE_ROUTES", "array");
    addSetting("corsMethods", "CORS_METHODS", "array");
    addSetting("headers", "HEADERS", "json");
    addSetting("maxPoolSize", "MAX_POOL_SIZE", "number");
    addSettings("outboundToken", "OUTBOUND_TOKEN", "string");

    return settings;
  } catch (error) {
    throw new Error(`Error parsing environment variables: ${error.message}`);
  }
};
