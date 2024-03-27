import { Request } from "node-fetch";
import { encode } from "..";
import { Transform } from "stream";
import { formatMteRelayHeader } from "../../../utils/mte-relay-header";

type EncDecType = "MTE" | "MKE";

export async function encodeRequest(
  request: Request,
  options: {
    clientId: string;
    origin: string;
    pairId: string;
    type: EncDecType;
    relayHeader: string;
    mteEncodedHeadersHeader: string;
    encodeUrl?: boolean;
    encodeHeaders?: boolean | string[];
  }
): Promise<Request> {
  const itemsToEncode: {
    data: string | Uint8Array;
    output: "B64" | "Uint8Array" | "stream";
  }[] = [];

  // get route to encode
  const url = new URL(request.url);
  const encodeUrl = options.encodeUrl ?? true;
  if (encodeUrl) {
    const route = url.pathname.slice(1) + url.search;
    itemsToEncode.push({ data: route, output: "B64" });
  }

  // get headers to encode
  const newHeaders: Record<string, string | string[]> = {};
  for (const [key, value] of request.headers.entries()) {
    newHeaders[key] = value;
  }
  delete newHeaders["x-mte-outbound-token"];
  delete newHeaders["x-mte-upstream"];
  delete newHeaders["host"];
  delete newHeaders["accept"];
  delete newHeaders["accept-encoding"];
  delete newHeaders["content-length"];
  delete newHeaders["connection"];
  const headersToEncode: Record<string, string | string[]> = {};
  let encodeHeaders = options.encodeHeaders ?? true;
  if (encodeHeaders) {
    if (Array.isArray(options.encodeHeaders)) {
      for (const header of options.encodeHeaders) {
        const value = request.headers.get(header);
        if (value) {
          headersToEncode[header] = value;
          delete newHeaders[header];
        }
      }
    } else {
      for (const [key, value] of Object.entries(newHeaders)) {
        headersToEncode[key] = value;
        delete newHeaders[key];
      }
    }
  }
  const ct = request.headers.get("content-type");
  if (ct) {
    headersToEncode["content-type"] = ct;
  }
  if (Object.keys(headersToEncode).length > 0) {
    encodeHeaders = true;
    const headerString = JSON.stringify(headersToEncode);
    itemsToEncode.push({ data: headerString, output: "B64" });
  } else {
    encodeHeaders = false;
  }

  // get body to encode
  let body: any = "";
  let bodyIsEncoded = false;
  const mayHaveBody = request.method !== "GET" && request.method !== "HEAD";
  if (mayHaveBody) {
    if (options.type === "MTE") {
      body = new Uint8Array(await request.arrayBuffer());
      if (body.byteLength > 0) {
        bodyIsEncoded = true;
        itemsToEncode.push({ data: body, output: "Uint8Array" });
      }
    } else {
      itemsToEncode.push({ data: "stream", output: "stream" });
      bodyIsEncoded = true;
    }
  }

  // encode items
  const result = await encode({
    id: `encoder.${options.origin}.${options.pairId}`,
    items: itemsToEncode,
    type: options.type,
  });

  // create new request url
  let newRequestUrl = request.url;
  if (encodeUrl) {
    const uriEncoded = encodeURIComponent(result[0] as string);
    newRequestUrl = url.origin + "/" + uriEncoded;
    result.shift();
  }

  newHeaders[options.relayHeader] = formatMteRelayHeader({
    encodeType: options.type,
    urlIsEncoded: encodeUrl,
    headersAreEncoded: encodeHeaders,
    bodyIsEncoded: bodyIsEncoded,
    clientId: options.clientId,
    pairId: options.pairId,
  });
  if (bodyIsEncoded) {
    newHeaders["content-type"] = "application/octet-stream";
  }
  if (encodeHeaders) {
    newHeaders[options.mteEncodedHeadersHeader] = result[0] as string;
    result.shift();
  }

  // create new request body
  let newRequestBody = request.body ? body : undefined;
  if (bodyIsEncoded) {
    if (options.type === "MTE") {
      newRequestBody = result[0] as Uint8Array;
    } else {
      const returnData = result[0];
      if ("encryptChunk" in returnData === false) {
        throw new Error("Invalid return data.");
      }
      const { encryptChunk, finishEncrypt } = returnData;
      newRequestBody = new Transform({
        transform(chunk, _encoding, callback) {
          try {
            const u8 = new Uint8Array(chunk);
            const encrypted = encryptChunk(u8);
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
          const data = finishEncrypt();
          if (data === null) {
            return callback(new Error("Encryption final failed."));
          }
          this.push(data);
          callback();
        },
      });
      request.body.pipe(newRequestBody);
    }
  }

  // form new request
  const newRequest = new Request(newRequestUrl, {
    method: request.method,
    headers: newHeaders,
    body: newRequestBody,
  });

  return newRequest;
}
