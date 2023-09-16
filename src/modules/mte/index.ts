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
} from "mte";
import { setItem, takeItem } from "./memory-cache";
import { MteRelayError } from "./errors";

type EncDecTypes = "MTE" | "MKE";

let mteWasm: MteWasm;

const cache = {
  saveState: setItem,
  takeState: takeItem,
};

const mteEncoderPool: MteEnc[] = [];
const mteDecoderPool: MteDec[] = [];
const mkeEncoderPool: MteMkeEnc[] = [];
const mkeDecoderPool: MteMkeDec[] = [];

let MAX_POOL_SIZE = 25;
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
}
function getEncoderFromPool(type: EncDecTypes) {
  if (type === "MTE") {
    const encoder = mteEncoderPool.pop();
    if (!encoder) {
      return MteEnc.fromdefault(mteWasm);
    }
    return encoder;
  }
  const encoder = mkeEncoderPool.pop();
  if (!encoder) {
    return MteMkeEnc.fromdefault(mteWasm);
  }
  return encoder;
}
function getDecoderFromPool(type: EncDecTypes) {
  if (type === "MTE") {
    console.log(`getDecoderFromPool: ${type}`);
    const decoder = mteDecoderPool.pop();
    if (!decoder) {
      return MteDec.fromdefault(mteWasm, 1000, -63);
    }
    return decoder;
  }
  const decoder = mkeDecoderPool.pop();
  if (!decoder) {
    return MteMkeDec.fromdefault(mteWasm, 1000, -63);
  }
  return decoder;
}
function returnEncoderToPool(encoder: MteMkeEnc | MteEnc) {
  if (encoder instanceof MteEnc) {
    if (mteEncoderPool.length < MAX_POOL_SIZE) {
      encoder.uninstantiate();
      return mteEncoderPool.push(encoder);
    }
    return encoder.destruct();
  }
  if (mkeEncoderPool.length < MAX_POOL_SIZE) {
    encoder.uninstantiate();
    return mkeEncoderPool.push(encoder);
  }
  return encoder.destruct();
}
function returnDecoderToPool(decoder: MteMkeDec | MteDec) {
  if (decoder instanceof MteDec) {
    if (mteDecoderPool.length < MAX_POOL_SIZE) {
      decoder.uninstantiate();
      return mteDecoderPool.push(decoder);
    }
    return decoder.destruct();
  }
  if (mkeDecoderPool.length < MAX_POOL_SIZE) {
    decoder.uninstantiate();
    return mkeDecoderPool.push(decoder);
  }
  return decoder.destruct();
}

// init MteWasm
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
}
export async function instantiateEncoder(options: {
  id: string;
  entropy: Uint8Array;
  nonce: string;
  personalization: string;
}) {
  const encoder = getEncoderFromPool("MKE");
  encoder.setEntropyArr(options.entropy);
  encoder.setNonce(options.nonce);
  const initResult = encoder.instantiate(options.personalization);
  validateStatusIsSuccess(initResult, encoder);
  const state = getMteState(encoder);
  await cache.saveState(options.id, state);
  returnEncoderToPool(encoder);
}
export async function instantiateDecoder(options: {
  id: string;
  entropy: Uint8Array;
  nonce: string;
  personalization: string;
}) {
  const decoder = getDecoderFromPool("MKE");
  decoder.setEntropyArr(options.entropy);
  decoder.setNonce(options.nonce);
  const initResult = decoder.instantiate(options.personalization);
  validateStatusIsSuccess(initResult, decoder);
  const state = getMteState(decoder);
  await cache.saveState(options.id, state);
  returnDecoderToPool(decoder);
}
export async function mkeEncode(
  payload: string | Uint8Array,
  options: {
    stateId: string;
    output: "B64" | "Uint8Array";
    type: EncDecTypes;
  }
) {
  const encoder = getEncoderFromPool(options.type);
  const currentState = await cache.takeState(options.stateId);
  if (!currentState) {
    returnEncoderToPool(encoder);
    throw new MteRelayError("State not found.", {
      stateId: options.stateId,
    });
  }
  restoreMteState(encoder, currentState);
  if (options.type === "MKE") {
    const nextStateResult = encoder.encodeStr(""); // Note: intentionally left empty for NextEncoderStateGeneration
    validateStatusIsSuccess(nextStateResult.status, encoder);
    const nextState = getMteState(encoder);
    await cache.saveState(options.stateId, nextState);
    restoreMteState(encoder, currentState);
  }
  let encodeResult: MteArrStatus | MteStrStatus;
  try {
    if (payload instanceof Uint8Array) {
      if (options.output === "Uint8Array") {
        encodeResult = encoder.encode(payload);
      } else {
        encodeResult = encoder.encodeB64(payload);
      }
    } else {
      if (options.output === "Uint8Array") {
        encodeResult = encoder.encodeStr(payload);
      } else {
        encodeResult = encoder.encodeStrB64(payload);
      }
    }
    validateStatusIsSuccess(encodeResult.status, encoder);
    if (options.type === "MTE") {
      const state = getMteState(encoder);
      await cache.saveState(options.stateId, state);
    }
    returnEncoderToPool(encoder);
  } catch (error) {
    throw new MteRelayError("Failed to encode.", {
      stateId: options.stateId,
      error: (error as Error).message,
    });
  }
  return "str" in encodeResult ? encodeResult.str : encodeResult.arr;
}
export async function mkeDecode(
  payload: string | Uint8Array,
  options: {
    stateId: string;
    output: "str" | "Uint8Array";
    type: EncDecTypes;
  }
) {
  const decoder = getDecoderFromPool(options.type);
  const currentState = await cache.takeState(options.stateId);
  if (!currentState) {
    returnDecoderToPool(decoder);
    throw new MteRelayError("State not found.", {
      stateId: options.stateId,
    });
  }
  restoreMteState(decoder, currentState);
  drbgReseedCheck(decoder);
  let decodeResult: MteArrStatus | MteStrStatus;
  try {
    if (payload instanceof Uint8Array) {
      if (options.output === "Uint8Array") {
        decodeResult = decoder.decode(payload);
      } else {
        decodeResult = decoder.decodeStr(payload);
      }
    } else {
      if (options.output === "Uint8Array") {
        decodeResult = decoder.decodeB64(payload);
      } else {
        decodeResult = decoder.decodeStrB64(payload);
      }
    }
    validateStatusIsSuccess(decodeResult.status, decoder);
  } catch (error) {
    throw new MteRelayError("Failed to decode.", {
      stateId: options.stateId,
      error: (error as Error).message,
    });
  }
  const state = getMteState(decoder);
  await cache.saveState(options.stateId, state);
  returnDecoderToPool(decoder);
  return "str" in decodeResult ? decodeResult.str : decodeResult.arr;
}
function validateStatusIsSuccess(status: MteStatus, mteBase: MteBase) {
  if (status !== MteStatus.mte_status_success) {
    const isError = mteBase.statusIsError(status);
    if (isError) {
      const statusName = mteBase.getStatusName(status);
      const description = mteBase.getStatusDescription(status);
      throw new MteRelayError("MTE Status was not successful.", {
        statusName,
        description,
      });
    }
  }
}
type EncDec = MteMkeEnc | MteMkeDec | MteEnc | MteDec;
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
  const threshhold = Number(
    String(encoder.getDrbgsReseedInterval(drbg)).substring(0, 15)
  );
  const counter = Number(String(encoder.getReseedCounter()).substring(0, 15));
  const reseedIsRequired = counter / threshhold > 0.9;
  if (reseedIsRequired) {
    throw new MteRelayError("DRBG reseed is required.");
  }
}
