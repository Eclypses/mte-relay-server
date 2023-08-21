# MTE Relay Server

The MTE Relay Server is a NodeJS server that proxies HTTP requests that have been MTE encoded.

### Installation

Please use the CLI command below to scaffold a new MTE Relay Server project.

```sh
cd ~/Desktop
npx create-mte-relay-server@latest
```

### Quick Start Guide

- Configure `mte-relay-config.yaml` file
- Update the `.npmrc` file with your auth token. This can be found in the Eclypses Developer Portal.
- Install your MTE library package. This can be found in the Eclypses Developer Portal.
  - Example: `npm i mte@npm:@eclypses/my-mte-library`
- Run locally with `npm run start`

### Config File

In the newly created directory is an `mte-relay-config.yaml` file with various configuration options for your instance of MTE Relay Server. Edit the file to match your application's requirements.

#### Configuration Options

The configuration file is a YAML file that contains the following properties. Examples are shown below.

- `upstream`
  - **Required**
  - The upstream application that inbound requests will be proxied to.
- `licenseCompany`
  - **Required**
  - Your company name. See your project settings in the [Eclypses Developer's Portal](https://developers.eclypses.com).
- `licenseKey`
  - **Required**
  - Your license key. See your project settings in the [Eclypses Developer's Portal](https://developers.eclypses.com).
- `clientIdSecret`
  - **Required**
  - A secret that will be used to sign the x-mte-client-id header. A 32+ character string is recommended.
- `corsOrigins`
  - **Required**
  - A list of URLs that will be allowed to make cross-origin requests to the server.
- `port`
  - The port that the server will listen on.
  - Default: `8080`.
- `debug`
  - A flag that enables debug logging.
  - Default: `false`
- `passThroughRoutes`
  - A list of routes that will be passed through to the upstream application without being MTE encoded/decoded.
- `mteRoutes`
  - A list of routes that will be MTE encoded/decoded. If this optional property is included, only the routes listed will be MTE encoded/decoded, and any routes not listed here or in `passThroughRoutes` will 404. If this optional property is not included, all routes not listed in `passThroughRoutes` will be MTE encoded/decoded.
- `corsMethods`
  - A list of HTTP methods that will be allowed to make cross-origin requests to the server.
  - Default: `GET, POST, PUT, DELETE`.
  - Note: `OPTIONS` and `HEAD` are always allowed.
- `headers`
  - An object of headers that will be added to all request/responses.
- `serverId`
  - A unique identifier for this server. A GUID or 32+ character string is recommended. Use this when load balancing multiple instances of MTE Relay Server so they all have the same server ID.
- `maxFormDataSize`
  - The maximum size of a form data request body in bytes. If a request body is larger than this, it will be rejected with a 413 error.
  - Default: `20,971,520` - 20 MB

#### Minimal Configuration Example

```yaml
upstream: https://api.my-company.com
licenseCompany: My Company, LLC.
licenseKey: 4vHSvWLTRvwx+JoThgT0p0kE
clientIdSecret: 2DkV4DDabehO8cifDktdF9elKJL0CKrk
corsOrigins:
  - https://www.my-company.com
  - https://dashboard.my-company.com
```

#### Full Configuration Example

```yaml
upstream: https://api.my-company.com
licenseCompany: My Company, LLC.
licenseKey: 4vHSvWLTRvwx+JoThgT0p0kE
clientIdSecret: 2DkV4DDabehO8cifDktdF9elKJL0CKrk
corsOrigins:
  - https://www.my-company.com
  - https://dashboard.my-company.com
port: 3000
debug: true
passThroughRoutes:
  - /health
  - /version
mteRoutes:
  - /api/v1/*
  - /api/v2/*
corsMethods:
  - GET
  - POST
  - DELETE
headers:
  x-service-name: mte-relay
serverId: 2DkV4DDabehO8cifDktdF9elKJL0CKrk
maxFormDataSize: 20971520
```

### Local Implementation

To run MTE Relay Server locally on your hardware, follow these instructions:

- Install your MTE library package. This can be found in the Eclypses Developer Portal.
  - Example: `npm i mte@npm:@eclypses/my-mte-library`
- Start the proxy server with `npm run start`

### Docker Implementation

To run MTE Relay Server in a Docker container, follow these instructions:

- Update the `.npmrc` file with youR auth token. This can be found in the Eclypses Developer Portal.
- Update the `Dockerfile` with your MTE library package name
- Update the `docker-compose.yml` file with
  - A local directory that can be used to persist application data
  - The absolute path to your `mte-relay-config.yaml` file
- Build the Docker image with `docker build . -t mte-relay-server`
- Run the Docker container with the command `docker compose up`

### Settings Adapter

If you don't want to (or can't) use a yaml file to load settings, you can write your own settings adapter. The settings adapter must export a function that returns a promise that resolves to a settings object with all the required settings (see [Configuration Options](#configuration-options)).

```javascript
module.exports = async function () {
  /* Load settings from somewhere... */
  const settings = loadSettings();
  return settings;
};
```

Then, you need to use a CLI flag to point to that settings file when starting the server.

`npm run start -- --settings-adapter /path_to/settings-adapter.js`

See more examples in the [examples/settings-adapters](examples/settings-adapters) directory.

### MTE State Cache Adapter

By default, MTE State is saved in-memory. This means that if the server is restarted, all MTE State will be lost. To persist MTE State across server restarts, or to share MTE state between multiple containers, you can use an external cache by writing your own cache adapter.

A cache adapter is a file that exports a function that returns a Promise that resolves to an object with the following methods:

```javascript
module.exports = async function () {
  return {
    takeState: async function (key) {
      // Return the MTE State for the given key
    },
    saveState: async function (key, state) {
      // Save the MTE State for the given key
    },
  };
};
```

Then, you need to use a CLI flag to point to that cache adapter file when starting the server.

`npm run start -- --cache-adapter /path_to/cache-adapter.js`

See examples in the [examples/cache-adapters](examples/cache-adapters) directory.

### Log Adapter

MTE Relay Server is built on Fastify, which uses [Pino](https://getpino.io) for logging. By default, logs are written to the `/data/mte-relay-server.log` file. To change this, you can use a log adapter. You may [write your own Pino log transport](https://getpino.io/#/docs/transports?id=writing-a-transport), or use an [existing Pino log transport](https://getpino.io/#/docs/transports?id=pino-v7-compatible).

A log adapter is a file that exports a function that returns a Promise that resolves a [Pino Transport](https://getpino.io/#/docs/transports?id=transports):

Example:\

```javascript
const path = require("path");

module.exports = async function () {
  return {
    transport: {
      target: "pino/file",
      options: {
        destination: path.join(process.cwd(), "/path_to/custom.log"),
      },
    },
  };
};
```

Then, you need to use a CLI flag to point to that log adapter file when starting the server.

`npm run start -- --log-adapter /path_to/log-adapter.js`

See examples in the [examples/log-adapters](examples/log-adapters) directory.

### Local Development

- Follow the quick start guide to configure requires files and install dependencies.
- Run `npm run dev` to start the server in development mode.

### Load Balancing

When load balancing two or more MTE Relay Servers, it is important that they all use the same cache adapter and server ID. This will ensure that MTE State is shared between all servers.
