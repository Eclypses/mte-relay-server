import { Response } from "node-fetch";
import { MteRelayError } from "../errors";
import { decode } from "../index";
import { parseMteRelayHeader } from "../../../utils/mte-relay-header";
import { Transform } from "stream";
import { getLogger } from "../../log";
import { restrictedHeaders } from "../../../utils/headers-to-ignore";

export async function decodeResponse(
  response: Response,
  options: {
    decoderId: string;
    mteEncodedHeadersHeader: string;
  }
) {
  const logger = getLogger();
  // read header to find out what to decode
  const relayHeader = response.headers.get(`x-mte-relay`);
  if (!relayHeader) {
    throw new MteRelayError("Missing required header", {
      "missing-header": `x-mte-relay`,
    });
  }
  logger.debug(`Decoding response with relay header: ${relayHeader}`);
  const relayOptions = parseMteRelayHeader(relayHeader);

  // store items that should be decoded
  const itemsToDecode: {
    data: string | Uint8Array;
    output: "str" | "Uint8Array" | "stream";
  }[] = [];

  // get headers to decode
  if (relayOptions.headersAreEncoded) {
    const header = response.headers.get(options.mteEncodedHeadersHeader);
    if (header) {
      logger.debug(`Decoded headers: ${header}`);
      itemsToDecode.push({ data: header, output: "str" });
    }
  }

  logger.debug(`Response Headers:`);
  Array.from(response.headers.entries()).forEach((entry) => {
    logger.debug(`Header: ${entry[0]}: ${entry[1]}`);
  });

  // get body to decode
  const useStreaming = relayOptions.useStreaming;
  logger.debug(`response body is encoded: ${relayOptions.bodyIsEncoded}`);
  if (relayOptions.bodyIsEncoded) {
    if (!useStreaming) {
      logger.debug(`Decoding response body as Uint8Array`);
      const ab = await response.arrayBuffer().catch((err) => {
        logger.error(`Failed to read response body as array buffer: ${err}`);
        throw new Error("Failed to read response body as array buffer.");
      });
      const u8 = new Uint8Array(ab);
      itemsToDecode.push({ data: u8, output: "Uint8Array" });
    } else {
      logger.debug(`Decoding response body as stream`);
      itemsToDecode.push({ data: "stream", output: "stream" });
    }
  }

  logger.debug(`Decode items in response`);
  // decode items
  const result = await decode({
    id: options.decoderId,
    items: itemsToDecode,
    type: relayOptions.encodeType!,
  });

  // create new response headers
  const newHeaders: Record<string, string | string[]> = {};
  for (const entry of response.headers.entries()) {
    newHeaders[entry[0]] = entry[1];
  }

  if (relayOptions.headersAreEncoded) {
    delete newHeaders[options.mteEncodedHeadersHeader];
    const headers: Record<string, string> = JSON.parse(result[0] as string);
    logger.debug(`Decoded headers: ${JSON.stringify(headers, null, 2)}`);
    for (const entry of Object.entries(headers)) {
      newHeaders[entry[0]] = entry[1];
    }
    result.shift();
  }

  // delete restricted headers
  restrictedHeaders.forEach((header) => {
    delete newHeaders[header];
  });

  logger.debug(`Decoded headers: ${JSON.stringify(newHeaders, null, 2)}`);

  // create new response body
  let newBody: any = response.body || undefined;
  if (relayOptions.bodyIsEncoded) {
    if (!useStreaming) {
      newBody = result[0] as Uint8Array;
    } else {
      const returnData = result[0];
      if ("decryptChunk" in returnData === false) {
        throw new Error("Invalid return data.");
      }
      const { decryptChunk, finishDecrypt } = returnData;

      newBody = new Transform({
        transform(chunk, _encoding, callback) {
          try {
            const u8 = new Uint8Array(chunk);
            const encrypted = decryptChunk(u8);
            if (encrypted === null) {
              return callback(new Error("Encryption failed."));
            }
            this.push(encrypted);
            callback();
          } catch (error) {
            callback(error as Error);
          }
        },
        final(callback) {
          const data = finishDecrypt();
          if (data === null) {
            return callback(new Error("Encryption final failed."));
          }
          this.push(data);
          callback();
        },
      });
      response.body.pipe(newBody);
    }
  }

  // form new response
  const newResponse = new Response(newBody, {
    headers: newHeaders,
    status: response.status,
    statusText: response.statusText,
  });

  return newResponse;
}
