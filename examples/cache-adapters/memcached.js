var Memcached = require("memcached");

const settings = {
  maxExpiration: 86400, // 1 day
  cacheSize: 64 * 1024 * 1024, // 64MB
};

module.exports = async function () {
  var memcached = new Memcached("127.0.0.1:11211", settings);
  console.log("Memcached connected successfully.");

  return {
    takeState: function (id) {
      return new Promise((resolve, reject) => {
        memcached.get(id, function (err, data) {
          if (err) {
            reject(err);
          }
          /**
           * Encoder State must be locked or removed from cache when in use
           *  - Prevents the same encoder state from being used more than once.
           * This is not true for decoders; their state should be left in cache even when in use.
           */
          if (id.includes("encoder")) {
            memcached.del(id, function (_err) {
              if (_err) {
                reject(_err);
              }
              resolve(data);
            });
            return;
          }
          resolve(data);
        });
      });
    },
    saveState: function (id, state) {
      return new Promise((resolve, reject) => {
        memcached.set(id, state, 86400, function (err) {
          if (err) {
            console.log(err);
            reject(err);
          }
          resolve();
        });
      });
    },
  };
};
