// headers that should NOT be copied between requests

export const restrictedHeaders: string[] = [
  // Hop-to-Hop Headers
  // "connection",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",

  // End-to-End Headers (managed automatically)
  "content-length",
  "host",
  "date",
  "server",
  "user-agent",
  "via",
  "expect",
];
