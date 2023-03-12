import fs from "fs";
import settings from "./settings";

export async function startupChecks() {
  // check that the PERSISTENT_DIR exists
  if (!fs.existsSync(settings.PERSISTENT_DIR)) {
    fs.mkdirSync(settings.PERSISTENT_DIR);
  }
  // check that the tmp directory exists
  if (!fs.existsSync(settings.TEMP_DIR_PATH)) {
    fs.mkdirSync(settings.TEMP_DIR_PATH);
  }
}
