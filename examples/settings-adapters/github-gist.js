/**
 * Pull in settings as JSON from Github Gist
 *
 * Dependencies:
 *  - npm i axios
 */

const axios = require("axios");

module.exports = async function () {
  const response = await axios.get(
    "https://gist.githubusercontent.com/TJBlackman/2b3b172a37ff9141fa7629fe88abd124/raw/8d38bf339059db9984886020fc9e972aa7e57bb6/mte-relay-settings.json"
  );
  console.log(`data: ${JSON.stringify(response.data, null, 2)}`);
  return response.data;
};
