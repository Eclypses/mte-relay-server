export interface RelayOptions {
  encodeType?: "MTE" | "MKE";
  urlIsEncoded?: boolean;
  headersAreEncoded?: boolean;
  bodyIsEncoded?: boolean;
  clientId?: string;
  pairId?: string;
  useStreaming?: boolean;
}

export function formatMteRelayHeader(options: RelayOptions) {
  let args = [];
  args.push(options.clientId);
  args.push(options.pairId);
  args.push(options.encodeType === "MTE" ? 0 : 1);
  args.push(options.urlIsEncoded ? 1 : 0);
  args.push(options.headersAreEncoded ? 1 : 0);
  args.push(options.bodyIsEncoded ? 1 : 0);
  args.push(options.useStreaming ? 1 : 0);
  return args.join(",");
}

export function parseMteRelayHeader(header: string): RelayOptions {
  const args = header.split(",");
  const clientId = args[0];
  const pairId = args[1];
  const encodeType = args[2] === "0" ? "MTE" : "MKE";
  const urlIsEncoded = args[3] === "1";
  const headersAreEncoded = args[4] === "1";
  const bodyIsEncoded = args[5] === "1";
  const useStreaming = args[6] === "1";
  return {
    encodeType,
    urlIsEncoded,
    headersAreEncoded,
    bodyIsEncoded,
    clientId,
    pairId,
    useStreaming,
  };
}
