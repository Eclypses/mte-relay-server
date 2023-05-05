// convert headers objects into Record<string,string>
export function convertHeaderValuesToString(
  headers: Record<string, string | string[] | undefined>
) {
  const result: Record<string, string> = {};

  for (const key in headers) {
    if (headers.hasOwnProperty(key)) {
      const value = headers[key];
      if (value) {
        if (Array.isArray(value)) {
          result[key] = value.join(",");
        } else {
          result[key] = value;
        }
      }
    }
  }

  return result;
}

// clone headers object, return result as Record<string,string>
export function cloneHeaders(
  headers: Record<string, string | string[] | undefined>
) {
  const _headers = convertHeaderValuesToString(headers);
  const result: Record<string, string> = {};
  for (const key in _headers) {
    if (_headers.hasOwnProperty(key)) {
      result[key] = _headers[key];
    }
  }
  return result;
}

export function makeHeaderAString(
  header: string | number | string[] | undefined
) {
  if (!header) {
    return "";
  }
  if (Array.isArray(header)) {
    return header.join(", ");
  }
  if (typeof header === "number") {
    return header.toString();
  }
  return header;
}
