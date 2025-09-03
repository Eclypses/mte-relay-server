# Migrating from v3 to v4

1. Install MTE Relay Server v4

   - `npm i mte-relay-server@4`

2. Update your license key.

   - Find the new v4 license in the [Developer Portal](https://developers.eclypses.com)
   - Update the old license key with the new one.
   - The licenseKey lives in your settings file, which by default is `mte-relay-config.yaml`

3. In your settings, delete `serverId` as it is deprecated.

   - The client will track each server via it's origin. Load balancing still works!

4. In your settings, delete `maxFormDataSize` as it is deprecated.

   - All requests are encoded the same, and this is simply no longer necessary to support FormData requests.

Done! Enjoy v4!
