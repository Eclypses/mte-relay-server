const { createClient } = require("redis");

module.exports = async function () {
  const redisClient = createClient({
    url: "redis://localhost:6379",
    socket: {
      tls: false,
    },
  });
  await redisClient.connect();
  console.log(`Redis connected successfully.`);

  return {
    takeState: async function (id) {
      const value = await redisClient.get(id);
      /**
       * Encoder State must be removed from cache when in use
       *  - Prevents the same encoder state from being used more than once.
       * This is not true for decoders; their state should be left in cache even when in use.
       */
      if (id.includes("encoder")) {
        await redisClient.del(id);
      }
      return value;
    },
    saveState: async function (id, state) {
      await redisClient.set(id, state, {
        EX: 86400, // expires in 24 hours (in seconds)
      });
    },
  };
};
