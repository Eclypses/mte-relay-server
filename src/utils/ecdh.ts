import crypto from "crypto";

/**
 * Generates ECDH keys, and returns a base64 representation of the public key, as well
 * as a closure function that can consume a foreign public key and generate a shared secret.
 * @returns An object with a public key and a function for generating a shared secret.
 *
 * Example:
 * ```js
 * const ecdh = await getEcdh();
 * console.log(ecdh.publicKey);
 * const secret = await ecdh.computeSharedSecret(foreignKey);
 * ```
 *
 * [NodeJS ECDH Docs](https://nodejs.org/api/crypto.html#class-ecdh)
 */
export function getEcdh() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const publicKey = ecdh.getPublicKey("base64");

  function computeSharedSecret(foreignPublicKeyBase64: string) {
    const secret = ecdh.computeSecret(foreignPublicKeyBase64, "base64");
    return new Uint8Array(secret);
  }

  return {
    publicKey,
    computeSharedSecret,
  };
}
