// headers that should NOT be copied between requests

export const restrictedHeaders: string[] = [
  // Hop-to-Hop Headers
  "Connection",
  "Keep-Alive",
  "Proxy-Authenticate",
  "Proxy-Authorization",
  "TE",
  "Trailer",
  "Transfer-Encoding",
  "Upgrade",

  // End-to-End Headers (managed automatically)
  "Content-Length",
  "Host",
  "Date",
  "Server",
  "User-Agent",
  "Via",
  "Expect",

  // Forwarded Headers (set by proxies/load balancers)
  // "Forwarded",
  // "X-Forwarded-For",
  // "X-Forwarded-Host",
  // "X-Forwarded-Proto",

  // Security-related Headers (typically managed by security layers)
  // "Authorization",
  // "WWW-Authenticate",
];
