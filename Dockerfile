# docker build . -t mte-relay-server-bun-alpine -f Dockerfile-bun

# Stage 1 - Install dependencies
FROM node:20-alpine as installer
WORKDIR /app
COPY ./package.json .
COPY ./.npmrc .
RUN npm install mte@npm:@eclypses/tblackman-llc-mte-relay-demo-sales-demo-mte-relay

# Stage 2 - Runtime
FROM oven/bun:alpine as runtime
WORKDIR /app
COPY --from=installer /app/node_modules ./node_modules
COPY ./package.json .
COPY ./dist/index.js .

# This _should_ be mapped into the container, but this is fine for testing.
COPY ./mte-relay-config.yaml .

# Expose port
EXPOSE 8080

CMD ["bun","index.js"]
