import fs from "fs";
import settings from "./settings";

export async function startupChecks() {
  const SETTINGS = await settings();

  // check that the PERSISTENT_DIR exists
  if (!fs.existsSync(SETTINGS.PERSISTENT_DIR)) {
    fs.mkdirSync(SETTINGS.PERSISTENT_DIR);
  }
  // check that the tmp directory exists
  if (!fs.existsSync(SETTINGS.TEMP_DIR_PATH)) {
    fs.mkdirSync(SETTINGS.TEMP_DIR_PATH);
  }

  // run startup script, if it they exist
  const flagIndex = process.argv.indexOf("--startup-script");
  if (flagIndex > -1) {
    // Get the file path after the flag
    const filePath = process.argv[flagIndex + 1];
    try {
      // Dynamically import the module
      const startupScript = await import(filePath);
      await startupScript.default();
    } catch (error) {
      console.log(`Failed to run startup script: ${filePath}`);
      console.log(error);
      process.exit(1);
    }
  }
}
