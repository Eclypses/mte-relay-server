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
}
