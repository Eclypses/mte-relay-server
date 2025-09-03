/**
 * Creates a 14-digit string of integers for use as a nonce.
 * @returns A random nonce as a string.
 */
export function getNonce() {
  return Math.round(Math.random() * 1e14).toString();
}
