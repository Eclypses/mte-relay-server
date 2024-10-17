import {
  MteEnc,
  MteDec,
  MteMkeEnc,
  MteMkeDec,
  MteWasm,
  MteBase,
  MteStatus,
  MteArrStatus,
  MteStrStatus,
  MteKyber,
  MteKyberStatus,
  MteKyberStrength,
} from "mte";
import { setItem, takeItem } from "./memory-cache";
import { MteRelayError } from "./errors";
import { getLogger } from "../log";

type EncDecTypes = "MTE" | "MKE";

let mteWasm: MteWasm;
export let finishEncryptBytes = 0;

export const cache = {
  saveState: setItem,
  takeState: takeItem,
};

const mteEncoderPool: MteEnc[] = [];
const mteDecoderPool: MteDec[] = [];
const mkeEncoderPool: MteMkeEnc[] = [];
const mkeDecoderPool: MteMkeDec[] = [];

let MAX_POOL_SIZE = 250;
function fillPools(max: number) {
  MAX_POOL_SIZE = max;
  let i = 0;
  while (i < MAX_POOL_SIZE) {
    mkeEncoderPool.push(MteMkeEnc.fromdefault(mteWasm));
    mkeDecoderPool.push(MteMkeDec.fromdefault(mteWasm, 1000, -63));
    mteEncoderPool.push(MteEnc.fromdefault(mteWasm));
    mteDecoderPool.push(MteDec.fromdefault(mteWasm));
    i++;
  }
  getLogger().debug(`Encoder / Decoder pools filled to ${MAX_POOL_SIZE}.`);
}
function getEncoderFromPool(type: EncDecTypes) {
  if (type === "MTE") {
    const encoder = mteEncoderPool.pop();
    if (!encoder) {
      getLogger().debug("MTE Encoder pool empty. Creating new instance.");
      return MteEnc.fromdefault(mteWasm);
    }
    return encoder;
  }
  const encoder = mkeEncoderPool.pop();
  if (!encoder) {
    getLogger().debug("MKE Encoder pool empty. Creating new instance.");
    return MteMkeEnc.fromdefault(mteWasm);
  }
  return encoder;
}
function getDecoderFromPool(type: EncDecTypes) {
  if (type === "MTE") {
    const decoder = mteDecoderPool.pop();
    if (!decoder) {
      getLogger().debug("MTE Decoder pool empty. Creating new instance.");
      return MteDec.fromdefault(mteWasm, 1000, -63);
    }
    return decoder;
  }
  const decoder = mkeDecoderPool.pop();
  if (!decoder) {
    getLogger().debug("MKE Decoder pool empty. Creating new instance.");
    return MteMkeDec.fromdefault(mteWasm, 1000, -63);
  }
  return decoder;
}
function returnEncoderToPool(encoder: MteMkeEnc | MteEnc) {
  encoder.uninstantiate();
  if (encoder instanceof MteEnc) {
    if (mteEncoderPool.length < MAX_POOL_SIZE) {
      return mteEncoderPool.push(encoder);
    }
    getLogger().debug("MTE Encoder pool full. Destructing instance.");
    return encoder.destruct();
  }
  if (mkeEncoderPool.length < MAX_POOL_SIZE) {
    return mkeEncoderPool.push(encoder);
  }
  getLogger().debug("MKE Encoder pool full. Destructing instance.");
  return encoder.destruct();
}
function returnDecoderToPool(decoder: MteMkeDec | MteDec) {
  decoder.uninstantiate();
  if (decoder instanceof MteDec) {
    if (mteDecoderPool.length < MAX_POOL_SIZE) {
      return mteDecoderPool.push(decoder);
    }
    getLogger().debug("MTE Decoder pool full. Destructing instance.");
    return decoder.destruct();
  }
  if (mkeDecoderPool.length < MAX_POOL_SIZE) {
    return mkeDecoderPool.push(decoder);
  }
  getLogger().debug("MKE Decoder pool full. Destructing instance.");
  return decoder.destruct();
}

export async function instantiateMteWasm(options: {
  licenseKey: string;
  companyName: string;
  saveState?: (id: string, value: string) => Promise<void>;
  takeState?: (id: string) => Promise<string | null>;
  encoderDecoderPoolSize: number;
}) {
  if (mteWasm) {
    return;
  }
  mteWasm = new MteWasm();
  await mteWasm.instantiate();
  const mteBase = new MteBase(mteWasm);
  const initResult = mteBase.initLicense(
    options.companyName,
    options.licenseKey
  );
  if (!initResult) {
    const licenseStatus = MteStatus.mte_status_license_error;
    const status = mteBase.getStatusName(licenseStatus);
    const message = mteBase.getStatusDescription(licenseStatus);
    throw new Error(`Error with MTE License.\n${status}: ${message}`);
  }
  if (options.saveState) {
    cache.saveState = options.saveState;
  }
  if (options.takeState) {
    cache.takeState = options.takeState;
  }
  fillPools(options.encoderDecoderPoolSize);
  const mkeEncoder = getEncoderFromPool("MKE");
  finishEncryptBytes = (mkeEncoder as MteMkeEnc).encryptFinishBytes();
  returnEncoderToPool(mkeEncoder);
}
export async function instantiateEncoder(options: {
  id: string;
  entropy: Uint8Array;
  nonce: string;
  personalization: string;
}) {
  getLogger().debug(
    "Create New Encoder: " +
      JSON.stringify({ ...options, entropy: options.entropy.toString() })
  );
  const encoder = getEncoderFromPool("MKE");
  encoder.setEntropyArr(options.entropy);
  encoder.setNonce(options.nonce);
  const initResult = encoder.instantiate(options.personalization);
  validateStatusIsSuccess(initResult, encoder);
  const state = getMteState(encoder);
  getLogger().debug("New Encoder State: " + state);
  await cache.saveState(options.id, state);
  returnEncoderToPool(encoder);
}
export async function instantiateDecoder(options: {
  id: string;
  entropy: Uint8Array;
  nonce: string;
  personalization: string;
}) {
  getLogger().debug(
    "Create New Decoder: " +
      JSON.stringify({ ...options, entropy: options.entropy.toString() })
  );
  const decoder = getDecoderFromPool("MKE");
  decoder.setEntropyArr(options.entropy);
  decoder.setNonce(options.nonce);
  const initResult = decoder.instantiate(options.personalization);
  validateStatusIsSuccess(initResult, decoder);
  const state = getMteState(decoder);
  getLogger().debug("New Decoder State: " + state);
  await cache.saveState(options.id, state);
  returnDecoderToPool(decoder);
}
export async function encode(options: {
  id: string;
  type: EncDecTypes;
  items: {
    data: string | Uint8Array;
    output: "B64" | "Uint8Array" | "stream";
  }[];
}) {
  const logger = getLogger();
  if (options.type === "MTE") {
    const hasStream = options.items.some((item) => item.output === "stream");
    if (hasStream) {
      logger.info("MTE does not support streaming. Use MKE instead.");
      throw new Error("MTE does not support streaming. Use MKE instead.");
    }
  }

  const currentState = await cache.takeState(options.id);
  if (!currentState) {
    throw new MteRelayError("State not found.", {
      stateId: options.id,
    });
  }
  const encoder = getEncoderFromPool(options.type);
  restoreMteState(encoder, currentState);
  // nextState generation + save nextState in cache
  if (options.type === "MKE") {
    let nextStateResult: MteStatus = 0;
    let i = 0;
    const iMax = options.items.length;
    for (; i < iMax; ++i) {
      nextStateResult = encoder.encodeStr("").status;
    }
    validateStatusIsSuccess(nextStateResult, encoder);
    const nextState = getMteState(encoder);
    logger.debug(`MKE Next State Generation: ${nextState}`);
    await cache.saveState(options.id, nextState);
    restoreMteState(encoder, currentState);
    logger.debug(
      `MKE Next State Generation successful! Rolling back state to original to do real encode: ${currentState}`
    );
  }
  let encodeResults: (
    | String
    | Uint8Array
    | {
        encryptChunk: (data: Uint8Array) => Uint8Array | null;
        finishEncrypt: () => Uint8Array;
      }
  )[] = [];
  let isCheckedOutForStreaming = false;
  try {
    for (const item of options.items) {
      if (item.output === "stream") {
        isCheckedOutForStreaming = true;
        (encoder as MteMkeEnc).startEncrypt();
        encodeResults.push({
          encryptChunk: (encoder as MteMkeEnc).encryptChunk,
          finishEncrypt: function () {
            const result = (encoder as MteMkeEnc).finishEncrypt();
            validateStatusIsSuccess(result.status, encoder);
            returnEncoderToPool(encoder);
            return result.arr!;
          },
        });
        continue;
      }
      let encodeResult: MteArrStatus | MteStrStatus;
      if (item.data instanceof Uint8Array) {
        if (item.output === "Uint8Array") {
          encodeResult = encoder.encode(item.data);
        } else {
          encodeResult = encoder.encodeB64(item.data);
        }
      } else {
        if (item.output === "Uint8Array") {
          encodeResult = encoder.encodeStr(item.data);
        } else {
          encodeResult = encoder.encodeStrB64(item.data);
        }
      }
      validateStatusIsSuccess(encodeResult.status, encoder);
      encodeResults.push(
        "str" in encodeResult ? encodeResult.str! : encodeResult.arr!
      );
    }
  } catch (error) {
    logger.debug(`Failed to encode: ${(error as Error).message}`);
    returnEncoderToPool(encoder);
    throw new MteRelayError("Failed to encode.", {
      stateId: options.id,
      error: (error as Error).message,
    });
  }
  if (options.type === "MTE") {
    const state = getMteState(encoder);
    cache.saveState(options.id, state);
  }
  if (!isCheckedOutForStreaming) {
    returnEncoderToPool(encoder);
  }
  return encodeResults;
}
export async function decode(options: {
  id: string;
  type: EncDecTypes;
  items: {
    data: string | Uint8Array;
    output: "str" | "Uint8Array" | "stream";
  }[];
}) {
  const logger = getLogger();
  if (options.type === "MTE") {
    const hasStream = options.items.some((data) => data.output === "stream");
    if (hasStream) {
      logger.info("MTE does not support streaming. Use MKE instead.");
      throw new Error("MTE does not support streaming. Use MKE instead.");
    }
  }
  const currentState = await cache.takeState(options.id);
  if (!currentState) {
    logger.error("State not found for decoder " + options.id + ".");
    throw new MteRelayError("State not found.", {
      stateId: options.id,
    });
  }
  const decoder = getDecoderFromPool(options.type);
  restoreMteState(decoder, currentState);
  drbgReseedCheck(decoder);
  const decodeResults: (
    | String
    | Uint8Array
    | {
        decryptChunk: (data: Uint8Array) => Uint8Array | null;
        finishDecrypt: () => Uint8Array;
      }
  )[] = [];
  let isCheckedOutForStreaming = false;
  try {
    for (const item of options.items) {
      if (item.output === "stream") {
        isCheckedOutForStreaming = true;
        (decoder as MteMkeDec).startDecrypt();
        decodeResults.push({
          decryptChunk: (decoder as MteMkeDec).decryptChunk,
          finishDecrypt: function () {
            const result = (decoder as MteMkeDec).finishDecrypt();
            validateStatusIsSuccess(result.status, decoder);
            const state = getMteState(decoder);
            cache.saveState(options.id, state);
            returnDecoderToPool(decoder);
            return result.arr!;
          },
        });
        continue;
      }
      let decodeResult: MteArrStatus | MteStrStatus;
      if (item.data instanceof Uint8Array) {
        if (item.output === "Uint8Array") {
          decodeResult = decoder.decode(item.data);
        } else {
          decodeResult = decoder.decodeStr(item.data);
        }
      } else {
        if (item.output === "Uint8Array") {
          decodeResult = decoder.decodeB64(item.data);
        } else {
          decodeResult = decoder.decodeStrB64(item.data);
        }
      }
      validateStatusIsSuccess(decodeResult.status, decoder);
      decodeResults.push(
        "str" in decodeResult ? decodeResult.str! : decodeResult.arr!
      );
    }
  } catch (error) {
    returnDecoderToPool(decoder);
    logger.error(`Failed to decode: ${(error as Error).message}`);
    throw new MteRelayError("Failed to decode.", {
      stateId: options.id,
      error: (error as Error).message,
    });
  }
  if (!isCheckedOutForStreaming) {
    const state = getMteState(decoder);
    returnDecoderToPool(decoder);
    cache.saveState(options.id, state);
  }
  return decodeResults;
}

function validateStatusIsSuccess(status: MteStatus, mteBase: MteBase) {
  const isError = mteBase.statusIsError(status);
  if (isError) {
    const statusName = mteBase.getStatusName(status);
    const description = mteBase.getStatusDescription(status);
    getLogger().debug(`Error Status: ${statusName} - ${description}`);
    throw new MteRelayError("MTE Status was not successful.", {
      statusName,
      description,
    });
  }
}
type EncDec = MteEnc | MteDec | MteMkeEnc | MteMkeDec;
function restoreMteState(encdec: EncDec, state: string): void {
  const result = encdec.restoreStateB64(state);
  validateStatusIsSuccess(result, encdec);
}
function getMteState(encoder: EncDec) {
  const state = encoder.saveStateB64();
  if (!state) {
    throw new MteRelayError("Failed to get state from encoder or decoder.");
  }
  return state;
}
function drbgReseedCheck(encoder: EncDec) {
  const drbg = encoder.getDrbg();
  const threshold = Number(
    String(encoder.getDrbgsReseedInterval(drbg)).substring(0, 15)
  );
  const counter = Number(String(encoder.getReseedCounter()).substring(0, 15));
  const reseedIsRequired = counter / threshold > 0.9;
  if (reseedIsRequired) {
    throw new MteRelayError("DRBG reseed is required.");
  }
}

export function getKyberInitiator() {
  const initiator = new MteKyber(mteWasm, MteKyberStrength.K512);
  const keyPair = initiator.createKeypair();
  if (keyPair.status !== MteKyberStatus.success) {
    throw new Error("Initiator: Failed to create the key pair.");
  }
  const publicKey = u8ToB64(keyPair.result1!);

  function decryptSecret(encryptedSecretHex: string) {
    const encryptedSecret = B64ToU8(encryptedSecretHex);
    const result = initiator.decryptSecret(encryptedSecret);
    if (result.status !== MteKyberStatus.success) {
      throw new Error("Initiator: Failed to decrypt the secret.");
    }
    return result.result1!;
  }

  return {
    publicKey,
    decryptSecret,
  };
}
export function getKyberResponder(b64String: string) {
  const publicKey = B64ToU8(b64String);
  const responder = new MteKyber(mteWasm, MteKyberStrength.K512);
  const result = responder.createSecret(publicKey);
  if (result.status !== MteKyberStatus.success) {
    throw new Error("Responder: Failed to create the key pair.");
  }
  // const secret = u8ToHex(result.result1!);
  const encryptedSecret = u8ToB64(result.result2!);

  return {
    secret: result.result1!,
    encryptedSecret,
  };
}

function u8ToB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
function B64ToU8(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"));
}
