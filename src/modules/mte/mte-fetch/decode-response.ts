import { Response, BodyInit } from "node-fetch";
import { MteRelayError } from "../errors";
import { decode, finishEncryptBytes } from "../index";
import { parseMteRelayHeader } from "../../../utils/mte-relay-header";

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
    output: "str" | "Uint8Array";
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
    const u8 = new Uint8Array(await response.arrayBuffer());
    if (u8.byteLength > finishEncryptBytes) {
      itemsToDecode.push({ data: u8, output: "Uint8Array" });
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
  let newBody: BodyInit | undefined = response.body || undefined;
  debugger;
  if (relayOptions.bodyIsEncoded) {
    newBody = result[0] as Uint8Array;
  }

  // form new response
  const newResponse = new Response(newBody, {
    headers: newHeaders,
    status: response.status,
    statusText: response.statusText,
  });

  return newResponse;
}
