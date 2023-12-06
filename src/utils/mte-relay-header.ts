export function formatMteRelayHeader(options: {
  type: "MTE" | "MKE";
  urlIsEncoded: boolean;
  headersAreEncoded: boolean;
  bodyIsEncoded: boolean;
  bodyEncodeType: "complete" | "stream";
  clientId: string;
  pairId: string;
}) {
  let args = [];
  args.push(options.clientId);
  args.push(options.pairId);
  args.push(options.type === "MTE" ? 0 : 1);
  args.push(options.urlIsEncoded ? 1 : 0);
  args.push(options.headersAreEncoded ? 1 : 0);
  args.push(options.bodyIsEncoded ? 1 : 0);
  args.push(options.bodyEncodeType === "complete" ? 0 : 1);
  return args.join(",");
}

export function parseMteRelayHeader(header: string) {
  const args = header.split(",");
  const clientId = args[0];
  const pairId = args[1];
  const type = args[2] === "0" ? "MTE" : "MKE";
  const urlIsEncoded = args[3] === "1";
  const headersAreEncoded = args[4] === "1";
  const bodyIsEncoded = args[5] === "1";
  const bodyEncodeType = args[6] === "0" ? "complete" : "stream";
  return {
    type,
    urlIsEncoded,
    headersAreEncoded,
    bodyIsEncoded,
    bodyEncodeType,
    clientId,
    pairId,
  };
}
