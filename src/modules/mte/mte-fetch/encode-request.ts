import fetch, { Request } from "node-fetch";
import { encode } from "..";
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
    output: "B64" | "Uint8Array";
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
  const body = new Uint8Array(await request.arrayBuffer());
  let bodyIsEncoded = false;
  if (body.byteLength > 0) {
    bodyIsEncoded = true;
    itemsToEncode.push({ data: body, output: "Uint8Array" });
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
  newHeaders["content-type"] = "application/octet-stream";
  if (encodeHeaders) {
    newHeaders[options.mteEncodedHeadersHeader] = result[0] as string;
    result.shift();
  }

  // create new request body
  let newRequestBody = request.body ? body : undefined;
  if (bodyIsEncoded) {
    newRequestBody = result[0] as Uint8Array;
  }

  // form new request
  const newRequest = new Request(newRequestUrl, {
    method: request.method,
    headers: newHeaders,
    body: newRequestBody,
  });

  return newRequest;
}
