import { FastifyPluginCallback } from "fastify";
import { instantiateMteWasm } from "./mte";
import { z } from "zod";

const cacheSchema = z.object({
  takeState: z.function(),
  saveState: z.function(),
});

const initMte: FastifyPluginCallback<{
  licenseCompany: string;
  licenseKey: string;
  maxPoolSize: number;
}> = async (fastify, options) => {
  try {
    let takeState: any = undefined;
    let saveState: any = undefined;

    // dynamically inject MTE State caching solution from consumer
    const flagIndex = process.argv.indexOf("--cache-adapter");
    if (flagIndex > -1) {
      // Get the file path after the flag
      const filePath = process.argv[flagIndex + 1];
      try {
        // Dynamically import the module
        const cacheModule = await import(filePath);
        const cache = await cacheModule.default();
        const validatedCache = cacheSchema.parse(cache);
        takeState = validatedCache.takeState;
        saveState = validatedCache.saveState;
        fastify.log.info(`Loaded cache adapter: ${filePath}`);
      } catch (error) {
        fastify.log.error(`Failed to load cache adapter: ${filePath}`);
        fastify.log.error(error);
        process.exit(1);
      }
    }

    // instantiate MTE
    await instantiateMteWasm({
      companyName: options.licenseCompany,
      licenseKey: options.licenseKey,
      saveState: saveState,
      takeState: takeState,
      encoderDecoderPoolSize: options.maxPoolSize,
    });
    fastify.log.info(`MTE instantiated successfully.`);
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
};

export default initMte;
