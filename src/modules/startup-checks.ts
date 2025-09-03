export async function startupChecks() {
  // run startup script, if it exists
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
