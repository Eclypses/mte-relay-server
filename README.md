# MTE Relay Server

The MTE Relay Server is a NodeJS server that proxies HTTP requests that have been MTE encoded.

## mte-relay-config.yaml

The configuration file is a YAML file that contains the following properties. Examples are shown below.

- `host`
  - **Required**
  - The host application that inbound requests will be proxied to.
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
  - A list of routes that will be passed through to the host application without being MTE encoded/decoded.
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
host: https://api.my-company.com
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
host: https://api.my-company.com
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
