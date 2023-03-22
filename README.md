# MTE Relay Server

The MTE Relay Server is a NodeJS server that proxies HTTP requests that have been MTE encoded.

### Installation

MTE Relay Server consists of several configuration files, and to make the setup process easier, we released a CLI tool that can scaffold the project for you. Run the below command where you would like to create the MTE Relay Server directory.

`npx create-mte-relay-server`

Next, configure the `mte-relay-config.yaml` file to match your application's requirements. Finally, choose a Docker implementation or a local implementation.

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
- `cookieSecret`
  - **Required**
  - A secret that will be used to sign the MTE session cookie.
- `corsOrigins`
  - **Required**
  - A list of URLs that will be allowed to make cross-origin requests to the server.
- `reportAccessToken`
  - **Required**
  - An access token that is required to generate a report of MTE usage. This token should be kept secret and only shared trusted parties.
- `port`
  - The port that the server will listen on.
  - Default: `8080`.
- `debug`
  - A flag that enables debug logging.
  - Default: `false`
- `passThroughRoutes`
  - A list of routes that will be passed through to the upstream application without being MTE encoded/decoded.
- `cookieName`
  - The name of the cookie that will be used to store the MTE session.
  - Default: `mte-relay-client-id`.
  - It is recommended that you change this value to something unique and obfuscated. For example: `N8QZYo1z6SYd`.
- `corsMethods`
  - A list of HTTP methods that will be allowed to make cross-origin requests to the server.
  - Default: `GET, POST, PUT, DELETE`.
  - Note: `OPTIONS` and `HEAD` are always allowed.
- `redisConnectionString`
  - The connection string for a Redis server that may be used to store the MTE session. If left undefined, the MTE session will be stored in memory.

#### Minimal Configuration Example

```yaml
upstream: https://api.my-company.com
licenseCompany: My Company, LLC.
licenseKey: 4vHSvWLTRvwx+JoThgT0p0kE
cookieSecret: 2DkV4DDabehO8cifDktdF9elKJL0CKrk
corsOrigins:
  - https://www.my-company.com
  - https://dashboard.my-company.com
reportAccessToken: x5l2212bAGAj81pAMm6bcB1tRipZjpDg
```

#### Full Configuration Example

```yaml
upstream: https://api.my-company.com
licenseCompany: My Company, LLC.
licenseKey: 4vHSvWLTRvwx+JoThgT0p0kE
cookieSecret: 2DkV4DDabehO8cifDktdF9elKJL0CKrk
corsOrigins:
  - https://www.my-company.com
  - https://dashboard.my-company.com
reportAccessToken: x5l2212bAGAj81pAMm6bcB1tRipZjpDg
port: 3000
debug: true
passThroughRoutes:
  - /health
  - /version
cookieName: N8QZYo1z6SYd
corsMethods:
  - GET
  - POST
  - DELETE
redisConnectionString: redis://localhost:6379
```

### Docker Implementation

To run MTE Relay Server in a Docker container, follow these instructions:

- Update the `.npmrc` file with youR auth token. This can be found in the Eclypses Developer Portal.
- Update the `Dockerfile` with your MTE library package name
- Update the `docker-compose.yml` file with
  - A local directory that can be used to persist application data
  - The absolute path to your `mte-relay-config.yaml` file
- Build the Docker image with `docker build . -t mte-relay-server`
- Run the Docker container with the command `docker compose up`

### Local Implementation

To run MTE Relay Server locally on your hardware, follow these instructions:

- Install your MTE library package. This can be found in the Eclypses Developer Portal.
  - Example: `npm i mte@npm:@eclypses/my-mte-library`
- Start the proxy server with `npm run start`

### Local Development

- Create a `.npmrc` file in the root of the project with the following contents. Include credentials from developer portal.
- Install your MTE library package. This can be found in the Eclypses Developer Portal.
  - Example: `npm i mte@npm:@eclypses/my-mte-library`
- Create a `mte-relay-config.yaml` file in the root of the project. See the [Config File](#config-file) section for more information.
- Run `npm run dev` to start the server in development mode.
