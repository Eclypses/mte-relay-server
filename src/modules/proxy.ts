import {
  FastifyRequest,
  FastifyInstance,
  FastifyReply,
  HTTPMethods,
} from "fastify";
import { mteDecode, mteEncode } from "mte-helpers";
import multipart from "@fastify/multipart";
import FormData from "form-data";
import axios, { AxiosResponse } from "axios";
import fs from "fs";
import path from "path";
import { concatTwoUint8Arrays } from "../utils/concat-arrays";
import { cloneHeaders, makeHeaderAString } from "../utils/header-utils";

function proxyHandler(
  fastify: FastifyInstance,
  options: {
    upstream: string;
    httpMethods: string[];
    contentTypeHeader: string;
    repairCode: number;
    tempDirPath: string;
    outboundToken?: string;
    mteClientIdHeader: string;
    maxFormDataSize: number;
  },
  done: any
) {
  // log mte usage
  fastify.addHook("onRequest", async (request, reply) => {
    if (!request.clientId) {
      return reply.status(401).send("Unauthorized");
    }
    // create sessionId by combining HttpOnly cookie with clientId header
    const clientIdHeader = request.headers[options.mteClientIdHeader];
    if (!clientIdHeader) {
      return reply
        .code(400)
        .send(`Missing ${options.mteClientIdHeader} header.`);
    }

    request.sessionId = request.clientId + "|" + clientIdHeader;
    request.recordMteUsage(request.clientId);
  });

  // parse multipart/form-data requests
  fastify.register(multipart, {
    limits: {
      fileSize: options.maxFormDataSize,
    },
  });

  // if not multipart/form-data, put entire buffer on request.body, and handle decode in handler
  fastify.addContentTypeParser("*", function (request, payload, done) {
    // parse data
    let _buffer = new Uint8Array(0);
    payload.on("data", (chunk: Uint8Array) => {
      _buffer = concatTwoUint8Arrays(_buffer, chunk);
    });
    payload.on("end", async () => {
      done(null, _buffer);
    });
  });

  // remove OPTIONS from httpMethods, they are not needed for server-to-server proxy
  const disallowedMethods = ["OPTIONS", "HEAD"];
  const methods = options.httpMethods.filter(
    (method) => !disallowedMethods.includes(method)
  );

  // Proxy catch-all for every request
  fastify.route({
    method: methods as HTTPMethods[],
    url: "*",
    onRequest: (request: FastifyRequest, reply: FastifyReply, done: any) => {
      // validate request includes clientID
      if (!request.clientId) {
        return reply.status(401).send("Unauthorized");
      }
      done();
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // determine if authorized outbound-proxy, or if inbound-proxy
        if (options.outboundToken) {
          // get bearer token from request
          const bearerToken = request.headers.authorization?.split(" ")[1];
          if (bearerToken && bearerToken !== options.outboundToken) {
            return reply.status(401).send("Unauthorized");
          }
        }

        // set headers for proxy request
        const proxyHeaders = cloneHeaders(request.headers);
        delete proxyHeaders[options.mteClientIdHeader];
        delete proxyHeaders[options.contentTypeHeader];
        delete proxyHeaders["content-length"];
        proxyHeaders.host = options.upstream.replace(/https?:\/\//, "");

        // set decoded payload to this variable
        let proxyPayload: any = undefined;

        // array of paths of tmp files to delete after request
        let tmpFilesToDelete: string[] = [];

        /**
         * Handle multipart/form-data requests
         */
        const contentType = request.headers["content-type"];
        const isMultipart = !!contentType && contentType.includes("multipart");
        if (Boolean(contentType) && isMultipart) {
          const decodedFormData = new FormData();
          // stores files to tmp dir and return files
          const formData = await request.file();

          if (!formData) {
            return reply.status(400).send("No files were uploaded.");
          }

          // separate fields and files into their own arrays
          let fields: {
            fieldname: string;
            mimetype: string;
            value: string;
          }[] = [];
          let files: {
            fieldname: string;
            filename: string;
            mimetype: string;
            file: ReadableStream;
            toBuffer: () => Promise<Buffer>;
          }[] = [];
          Object.entries(formData.fields).forEach((field: any) => {
            if (field[1].mimetype === "application/octet-stream") {
              files.push(field[1]);
            } else {
              fields.push(field[1]);
            }
          });

          try {
            // decode text fields first
            let i = 0;
            const iMax = fields.length;
            for (; i < iMax; ++i) {
              const _field = fields[i];
              const decodedFieldName = await mteDecode(_field.fieldname, {
                id: `decoder_${request.sessionId}`,
                sequenceWindow: -63,
                timestampWindow: 1000,
                output: "str",
              });
              const decodedFieldValue = await mteDecode(_field.value, {
                id: `decoder_${request.sessionId}`,
                sequenceWindow: -63,
                timestampWindow: 1000,
                output: "str",
              });
              decodedFormData.append(decodedFieldName, decodedFieldValue);
            }

            // decode file fields second
            let ii = 0;
            const iiMax = files.length;
            for (; ii < iiMax; ii++) {
              const _file = files[ii];
              const decodedFieldName = await mteDecode(_file.fieldname, {
                id: `decoder_${request.sessionId}`,
                sequenceWindow: -63,
                timestampWindow: 1000,
                output: "str",
              });
              const fieldName = decodeURIComponent(_file.filename);
              const decodedFileName = await mteDecode(fieldName, {
                id: `decoder_${request.sessionId}`,
                sequenceWindow: -63,
                timestampWindow: 1000,
                output: "str",
              });
              const buffer = await _file.toBuffer();
              const u8 = new Uint8Array(buffer);
              const decodedFile = await mteDecode(u8, {
                id: `decoder_${request.sessionId}`,
                sequenceWindow: -63,
                timestampWindow: 1000,
                output: "Uint8Array",
              });
              // write decoded file to tmp dir
              const id = Math.floor(Math.random() * 1e15);
              const tmpPath = path.join(options.tempDirPath, `${id}.tmp`);
              tmpFilesToDelete.push(tmpPath);
              await fs.promises.writeFile(tmpPath, decodedFile);
              const stream = fs.createReadStream(tmpPath);
              decodedFormData.append(decodedFieldName, stream, {
                filename: decodedFileName,
              });
            }
          } catch (error) {
            console.log(error);
            return reply.status(options.repairCode).send();
          }

          // manage headers
          proxyHeaders[
            "content-type"
          ] = `multipart/form-data; boundary=${decodedFormData.getBoundary()}`;

          // set decoded payload to proxyPayload
          proxyPayload = decodedFormData;
        }

        /**
         * Handle NON-multipart/form-data requests
         */
        if (Boolean(request.body) && !isMultipart) {
          const encodedContentType = request.headers[options.contentTypeHeader];
          let decodedContentType: string = contentType || "";
          if (encodedContentType) {
            try {
              decodedContentType = await mteDecode(
                encodedContentType as string,
                {
                  id: `decoder_${request.sessionId}`,
                  sequenceWindow: -63,
                  timestampWindow: 1000,
                  keepAlive: 1000,
                }
              );
            } catch (error) {
              console.log(error);
              return reply.status(options.repairCode).send();
            }
          }

          // decode incoming payload
          let decodedPayload: any = request.body;
          if (request.body) {
            try {
              decodedPayload = await mteDecode(request.body as any, {
                id: `decoder_${request.sessionId}`,
                timestampWindow: 1000,
                sequenceWindow: -63,
                keepAlive: 1000,
                // @ts-ignore
                output: contentTypeIsText(decodedContentType)
                  ? "str"
                  : "Uint8Array",
              });
            } catch (error) {
              console.log(error);
              return reply.status(options.repairCode).send();
            }
          }

          // set content-type header
          proxyHeaders["content-type"] = decodedContentType;

          // set decoded payload to proxyPayload
          proxyPayload = decodedPayload;
        }

        // make new request
        let proxyResponse: void | AxiosResponse<any, any> = void 0;
        try {
          proxyResponse = await axios({
            method: request.method,
            url: options.upstream + request.url,
            headers: proxyHeaders,
            data: proxyPayload,
            maxRedirects: 0,
            responseType: "arraybuffer",
            validateStatus: (status) => status < 400,
            transformResponse: (data, _headers) => data,
          });
        } catch (error: any) {
          const headers = error.response?.headers;
          if (headers) {
            delete headers["access-control-allow-origin"];
            reply.headers(headers);
          }
          const status = error.response?.status;
          const body = error.response?.data;
          if (status) {
            return reply.status(status).send(body || undefined);
          }
          let message = "Unknown error";
          if (error.message) {
            message = error.message;
          }
          return reply.status(500).send(message);
        }

        if (!proxyResponse) {
          return reply.status(500).send("No Response.");
        }

        // create response headers
        proxyResponse.headers["access-control-allow-credentials"] = "true";
        proxyResponse.headers["access-control-allow-methods"] = reply.getHeader(
          "access-control-allow-methods"
        );
        proxyResponse.headers[options.mteClientIdHeader] = request.sessionId!;
        // @ts-ignore
        const proxyResponseHeaders = cloneHeaders(proxyResponse.headers);
        // merge these headers with upstream server headers, if present
        proxyResponseHeaders["access-control-allow-headers"] = (() => {
          let value: string[] = [];
          const replyHeader = reply.getHeader("access-control-allow-headers");
          if (replyHeader) {
            value.push(makeHeaderAString(replyHeader));
          }
          const proxyResponseHeader =
            proxyResponse.headers["access-control-allow-headers"];
          if (proxyResponseHeader) {
            value.push(makeHeaderAString(proxyResponseHeader));
          }
          return value.join(", ");
        })();
        proxyResponseHeaders["access-control-expose-headers"] = (() => {
          let value: string[] = [];
          const replyHeader = reply.getHeader("access-control-expose-headers");
          if (replyHeader) {
            value.push(makeHeaderAString(replyHeader));
          }
          const proxyResponseHeader =
            proxyResponse.headers["access-control-expose-headers"];
          if (proxyResponseHeader) {
            value.push(makeHeaderAString(proxyResponseHeader));
          }
          return value.join(", ");
        })();
        delete proxyResponseHeaders["content-length"];
        delete proxyResponseHeaders["transfer-encoding"];

        // copy proxyResponse headers to reply
        reply.headers(proxyResponseHeaders);
        reply.status(proxyResponse.status);

        // encode response content-type header
        const _contentType = proxyResponseHeaders["content-type"];
        if (_contentType) {
          const encodedContentType = await mteEncode(_contentType, {
            id: `encoder_${request.sessionId}`,
            output: "B64",
          });
          reply.header(options.contentTypeHeader, encodedContentType);
        }

        // if no body, send reply
        const _body = proxyResponse.data;
        if (!_body) {
          reply.send();
        }

        // encode body
        const encodedBody = await mteEncode(_body, {
          id: `encoder_${request.sessionId}`,
          output: "Uint8Array",
        });
        const _buffer = Buffer.from(encodedBody);

        reply.header("Content-Type", "application/octet-stream");
        reply.send(_buffer);

        // delete tmp files if they exist
        if (tmpFilesToDelete.length > 0) {
          tmpFilesToDelete.forEach((file) => {
            fs.promises.rm(file).catch((err) => {
              console.log(`Error deleting tmp file: ${err}`);
            });
          });
        }
      } catch (error) {
        console.log(error);
        let msg = "An unknown error occurred";
        if (error instanceof Error) {
          msg = error.message;
        }
        reply.status(500).send(msg);
      }
    },
  });

  done();
}

export default proxyHandler;

// determine if encoded content should be decoded to text or to UInt8Array
function contentTypeIsText(contentType: string) {
  const textsTypes = ["text", "json", "xml", "javascript", "urlencoded"];
  const _lowerContentType = contentType.toLowerCase();
  let i = 0;
  const iMax = textsTypes.length;
  for (; i < iMax; i++) {
    const _type = textsTypes[i];
    if (_lowerContentType.includes(_type)) {
      return true;
    }
  }
  return false;
}
