import { FastifyInstance } from "fastify";
import fastifyPlugin from "fastify-plugin";
import { instantiateMteWasm } from "./mte";
import { z } from "zod";

const cacheSchema = z.object({
  takeState: z.function(),
  saveState: z.function(),
});

async function initMte(
  _fastify: FastifyInstance,
  options: {
    licenseCompany: string;
    licenseKey: string;
  },
  done: any
) {
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
        _fastify.log.info(`Loaded cache adapter: ${filePath}`);
      } catch (error) {
        _fastify.log.error(`Failed to load cache adapter: ${filePath}`);
        _fastify.log.error(error);
        process.exit(1);
      }
    }

    // instantiate MTE
    await instantiateMteWasm({
      companyName: options.licenseCompany,
      licenseKey: options.licenseKey,
      saveState: saveState,
      takeState: takeState,
    });
    _fastify.log.info(`MTE instantiated successfully.`);
    done();
  } catch (error) {
    _fastify.log.error(error);
    process.exit(1);
  }
}

export default fastifyPlugin(initMte);
