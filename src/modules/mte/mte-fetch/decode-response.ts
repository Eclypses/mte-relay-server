import { Response } from "node-fetch";
import { MteRelayError } from "../errors";
import { decode, finishEncryptBytes } from "../index";
import { parseMteRelayHeader } from "../../../utils/mte-relay-header";
import { Transform } from "stream";

export async function decodeResponse(
  response: Response,
  options: {
    decoderId: string;
    mteEncodedHeadersHeader: string;
  }
) {
  // read header to find out what to decode
  const x = response.headers.get(`x-mte-relay`);
  if (!x) {
    throw new MteRelayError("Missing required header", {
      "missing-header": `x-mte-relay`,
    });
  }
  const relayOptions = parseMteRelayHeader(x);

  // store items that should be decoded
  const itemsToDecode: {
    data: string | Uint8Array;
    output: "str" | "Uint8Array" | "stream";
  }[] = [];

  // get headers to decode
  if (relayOptions.headersAreEncoded) {
    const header = response.headers.get(options.mteEncodedHeadersHeader);
    if (header) {
      itemsToDecode.push({ data: header, output: "str" });
    }
  }

  // get body to decode
  if (relayOptions.bodyIsEncoded) {
    if (relayOptions.encodeType === "MTE") {
      const u8 = new Uint8Array(await response.arrayBuffer());
      if (u8.byteLength > finishEncryptBytes) {
        itemsToDecode.push({ data: u8, output: "Uint8Array" });
      }
    } else {
      itemsToDecode.push({ data: "stream", output: "stream" });
    }
  }

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
    for (const entry of Object.entries(headers)) {
      newHeaders[entry[0]] = entry[1];
    }
    result.shift();
  }

  // create new response body
  let newBody: any = response.body || undefined;
  if (relayOptions.bodyIsEncoded) {
    if (relayOptions.encodeType === "MTE") {
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
