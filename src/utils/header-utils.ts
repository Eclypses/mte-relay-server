/**
 * Create a clone of headers object, and add or remove MTE Relay headers
 * @param headers A headers object
 * @param appHeaders A headers object
 * @param action 'ADD' or 'REMOVE'
 * @returns An object of headers
 */
export function mergeHeaders(
  headers: Record<string, string | string[] | undefined>,
  appHeaders: Record<string, string | string[] | undefined>,
  action: "ADD" | "REMOVE"
) {
  const stringHeaders = convertHeadersValuesToString(headers);
  const stringAppHeaders = convertHeadersValuesToString(appHeaders);
  const result: Record<string, string> = {};

  // Clone all key-value pairs in headers into the new object
  for (const key in stringHeaders) {
    if (stringHeaders.hasOwnProperty(key)) {
      result[key] = stringHeaders[key];
    }
  }

  // Check if key-value pairs in appHeaders exist in the new object
  // If action is ADD, concatenate the values with a comma
  // If action is REMOVE, find the value in the string and replace it with an empty string
  for (const key in stringAppHeaders) {
    if (stringAppHeaders.hasOwnProperty(key) && result.hasOwnProperty(key)) {
      const resultKeyArray = stringHeaders[key].split(",").map((i) => i.trim());
      const appHeadersKeyArray = stringAppHeaders[key]
        .split(",")
        .map((i) => i.trim());
      if (action === "ADD") {
        if (key.toLowerCase() === "access-control-allow-origin") {
          result[key] = stringAppHeaders[key];
          continue;
        }
        if (key.toLowerCase() === "access-control-allow-credentials") {
          result[key] = "true";
          continue;
        }

        const set = new Set([...resultKeyArray, ...appHeadersKeyArray]);
        result[key] = Array.from(set).join(", ");
      } else {
        const filtered = resultKeyArray.filter(
          (value) => !appHeadersKeyArray.includes(value)
        );
        result[key] = filtered.join(", ");
      }
    }
  }

  return result;
}

// convert headers objects into Record<string,string>
export function convertHeadersValuesToString(
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
