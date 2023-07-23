// Use default Fastify logger
// https://fastify.dev/docs/latest/Reference/Logging/

module.exports = async function () {
  return true;
};

// Example: Set log level to Debug
// module.exports = async function () {
//   return {
//     level: 'debug',
//   };
// };
