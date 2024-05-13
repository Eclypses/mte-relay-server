import crypto from "crypto";

/**
 * Generates a signed string by appending a signature to the input string.
 * The signature is generated using the HMAC-SHA256 algorithm with the provided secret.
 *
 * @param {string} inputString - The input string to be signed.
 * @param {string} secret - The secret used for generating the signature.
 * @returns {string} The signed string, consisting of the original input string and the appended signature.
 */
export function signAString(inputString: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(inputString);
  const signature = hmac.digest("hex");
  return `${inputString}.${signature}`;
}

/**
 * Verifies the integrity of a signed string by comparing the provided signature
 * with the signature calculated using the HMAC-SHA256 algorithm and the provided secret.
 *
 * @param {string} signedString - The signed string to be verified, consisting of the original string and the signature.
 * @param {string} secret - The secret used for calculating the signature.
 * @returns {string|null} The original value that was signed, or null if the signature is invalid.
 */
export function verifySignedString(
  signedString: string,
  secret: string
): string | null {
  const [inputString, signature] = signedString.split(".");

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(inputString);
  const calculatedSignature = hmac.digest("hex");

  return calculatedSignature === signature ? inputString : null;
}

// Example usage:
// const input = "Hello, world!";
// const secret = "N26DPVHMjRXCITzL0dthBxQcGrymwAul";
// const signedInput = signAString(input, secret);
// console.log(signedInput);

// const value = verifySignedString(signedInput, secret);
// console.log(value);
