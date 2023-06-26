const fsp = require("fs/promises");
const path = require("path");

// path to json file
const FILE_PATH = path.join(__dirname, "json-cache.json");

module.exports = async function () {
  return {
    takeState: async function (id) {
      const json = await fsp.readFile(FILE_PATH, { encoding: "utf-8" });
      const data = JSON.parse(json);
      const state = data[id];
      /**
       * Encoder State must be locked or removed from cache when in use, so
       * the same state cannot be used more than once.
       * This is not true for decoders; their state should be left in cache even when in use.
       */
      console.log(`reading ${id}\n${state}\n`);
      // if (id.includes("encoder")) {
      //   console.log(`deleting ${id}\n`);
      //   delete data[id];
      // }
      await fsp.writeFile(FILE_PATH, JSON.stringify(data, null, 2), {
        encoding: "utf-8",
      });

      return state;
    },
    saveState: async function (id, state) {
      console.log(`writing ${id}\n`);
      const json = await fsp.readFile(FILE_PATH, { encoding: "utf-8" });
      const data = JSON.parse(json);
      data[id] = state;
      await fsp.writeFile(FILE_PATH, JSON.stringify(data, null, 2), {
        encoding: "utf-8",
      });
    },
  };
};
