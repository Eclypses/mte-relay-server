// determine if content should be decoded to text or to UInt8Array
export function contentTypeIsText(contentType: string) {
  const textsTypes = ["text", "json", "xml", "javascript", "urlencoded"];
  return textsTypes.some((i) => contentType.toLowerCase().includes(i));
}
