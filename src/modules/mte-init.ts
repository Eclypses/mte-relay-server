import { FastifyInstance } from "fastify";
import fastifyPlugin from "fastify-plugin";
import { instantiateMteWasm } from "mte-helpers";
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
      licenseCompany: options.licenseCompany,
      licenseKey: options.licenseKey,
      sequenceWindow: -63,
      encoderType: "MKE",
      decoderType: "MKE",
      saveStateAs: "B64",
      keepAlive: 1000,
      saveState: hasRedisUrl
        ? async function customSaveState(id, value) {
            await redisClient!.set(id, value);
          }
        : undefined,
      takeState: hasRedisUrl
        ? async function customTakeState<T>(id: string) {
            const value = await redisClient!.get(id);
            await redisClient!.del(id);
            return value as unknown as T;
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
