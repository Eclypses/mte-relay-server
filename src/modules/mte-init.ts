import { FastifyInstance } from "fastify";
import fastifyPlugin from "fastify-plugin";
import { instantiateMteWasm } from "./mte";
import { createClient, RedisClientType } from "redis";

async function initMte(
  _fastify: FastifyInstance,
  options: {
    redisUrl?: string;
    licenseCompany: string;
    licenseKey: string;
  },
  done: any
) {
  try {
    // if Redis is available, connect to it
    const hasRedisUrl = Boolean(options.redisUrl);
    let redisClient: null | RedisClientType = null;
    if (hasRedisUrl) {
      redisClient = createClient({
        url: options.redisUrl,
      });
      await redisClient.connect();
    }

    // instantiate MTE
    await instantiateMteWasm({
      companyName: options.licenseCompany,
      licenseKey: options.licenseKey,
      saveState: hasRedisUrl
        ? async function customSaveState(id, value) {
            await redisClient!.set(id, value);
          }
        : undefined,
      takeState: hasRedisUrl
        ? async function customTakeState(id) {
            const value = await redisClient!.get(id);
            // If it is a decoder, do NOT remove it's state from cache.
            // Two or more decoders can be created with the same state at the same time. This is NOT true for encoders.
            if (!id.includes("decoder")) {
              await redisClient!.del(id);
            }
            return value;
          }
        : undefined,
    });
    console.log(`MTE instantiated successfully.`);
    done();
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
}

export default fastifyPlugin(initMte);
