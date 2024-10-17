import fetch, { Request, RequestInfo, RequestInit, Response } from "node-fetch";
import { mteFetchDefaults } from "./settings";
import { MteRelayError } from "../errors";
import {
  OriginStatus,
  getClientId,
  deleteClientId,
  deletePairIdFromQueue,
  getNextPairIdFromQueue,
  setClientId,
  setOriginStatus,
  getOriginStatus,
  addPairIdToQueue,
} from "./cache";
import { getKyberInitiator, instantiateEncoder, instantiateDecoder } from "..";
import { parseMteRelayHeader } from "../../../utils/mte-relay-header";
import { decodeResponse } from "./decode-response";
import { encodeRequest } from "./encode-request";
import { generateRandomId } from "../../../utils/generate-id";
import { getLogger } from "../../log";

const NUMBER_OF_PAIRS = 5;

type MteRequestOptions = {
  encodeUrl: boolean;
  encodeHeaders: boolean | string[];
  encodeType: "MTE" | "MKE";
};
type MteHeaders = {
  relayHeader: string;
  mteEncodedHeadersHeader: string;
};

/**
 * Send an MTE encoded request.
 *
 * @param url Request URL. Same as Fetch API.
 * @param options Request options. Same as Fetch API.
 * @param mteOptions MTE Request options.
 * @param {"MTE" | "MKE"} mteOptions.encodeType The encoding type to use. Default value set in initMteRelayClient.
 * @param {boolean} mteOptions.encodeUrl Whether to encode the URL. Default value set in initMteRelayClient.
 * @param {boolean | string[]} mteOptions.encodeHeaders Whether to encode the headers. Default value set in initMteRelayClient.
 * @returns {Response} A decrypted Response object.
 */
export async function mteFetch(
  url: RequestInfo,
  mteHeaders: MteHeaders,
  options?: RequestInit,
  mteOptions?: Partial<MteRequestOptions>
) {
  return await sendMteRequest(url, mteHeaders, options, mteOptions);
}

// export network request function
async function sendMteRequest(
  url: RequestInfo,
  mteHeaders: MteHeaders,
  options?: RequestInit,
  mteOptions?: Partial<MteRequestOptions>,
  requestOptions?: {
    isLastAttempt?: boolean;
    revalidateServer?: boolean;
  }
): Promise<Response> {
  let pairId = "";
  let requestOrigin = "";
  const logger = getLogger();
  try {
    // use or create Request object
    let _request: Request;
    if (url instanceof Request) {
      _request = url;
    } else {
      _request = new Request(url, options);
    }
    const _url = new URL(_request.url);

    // preserve server origin, incase request fails and we need to resend
    requestOrigin = _url.origin;

    // validate server is MTE Relay server
    let originStatus = await getOriginStatus(requestOrigin);

    // init options
    const _mteOptions: MteRequestOptions = {
      encodeUrl: mteOptions?.encodeUrl ?? mteFetchDefaults.encodeUrl,
      encodeHeaders:
        mteOptions?.encodeHeaders ?? mteFetchDefaults.encodeHeaders,
      encodeType: mteOptions?.encodeType || mteFetchDefaults.encodeType,
    };

    // validate remote is MTE Relay Server and pair with it
    if (originStatus === "validate" || requestOptions?.revalidateServer) {
      try {
        originStatus = await validateRemoteIsMteRelay(
          requestOrigin,
          mteHeaders.relayHeader
        );
      } catch (error: any) {
        if (MteRelayError.isMteErrorStatus(error.status)) {
          throw new MteRelayError(
            MteRelayError.getStatusErrorMessages(error.status)!
          );
        } else {
          setOriginStatus(requestOrigin, "invalid");
          throw new Error("Origin is not an MTE Relay server.");
        }
      }
      await pairWithOrigin(requestOrigin, mteHeaders.relayHeader).catch(
        (error) => {
          setOriginStatus(requestOrigin, "invalid");
          throw error;
        }
      );
      originStatus = "paired";
      setOriginStatus(requestOrigin, originStatus);
    }

    // if it's pending, recheck every (100 * i)ms
    if (originStatus === "pending") {
      for (let i = 1; i < 20; ++i) {
        await sleep(i * 100);
        originStatus = await getOriginStatus(requestOrigin);
        if (originStatus === "paired") {
          break;
        }
        if (originStatus === "invalid") {
          throw new Error("Origin status is invalid.");
        }
      }
      if (originStatus !== "paired") {
        throw new Error("Origin is not paired.");
      }
    }
    if (originStatus === "invalid") {
      throw new Error("Origin is not an MTE Relay server.");
    }
    const clientId = getClientId(requestOrigin);
    if (!clientId) {
      throw new Error("Origin is missing ClientId");
    }

    pairId = getNextPairIdFromQueue(requestOrigin);

    /**
     * MTE Encode Headers and Body (if they exist)
     */
    const encodedRequest = await encodeRequest(_request, {
      pairId,
      type: _mteOptions.encodeType,
      origin: requestOrigin,
      clientId: clientId,
      encodeUrl: _mteOptions.encodeUrl,
      encodeHeaders: _mteOptions.encodeHeaders,
      relayHeader: mteHeaders.relayHeader,
      mteEncodedHeadersHeader: mteHeaders.mteEncodedHeadersHeader,
    });

    /**
     * Send the request
     */
    let response = await fetch(encodedRequest);
    logger.debug(`Response status: ${response.status}`);

    // parse header for clientId, then save it as a cookie
    const mteRelayHeader = response.headers.get(mteHeaders.relayHeader);
    if (!mteRelayHeader) {
      throw new Error("Origin is not an MTE Relay server.");
    }
    const parsedRelayHeaders = parseMteRelayHeader(mteRelayHeader);
    if (!parsedRelayHeaders.clientId) {
      throw new Error(`Response is missing clientId header`);
    }
    setClientId(requestOrigin, parsedRelayHeaders.clientId);

    // decode response
    const decodedResponse = await decodeResponse(response, {
      decoderId: `decoder.${requestOrigin}.${parsedRelayHeaders.pairId}`,
      mteEncodedHeadersHeader: mteHeaders.mteEncodedHeadersHeader,
    });
    return decodedResponse;
  } catch (error) {
    if (error instanceof MteRelayError) {
      // server-side secret changed, revalidate server
      if (error.status === 566) {
        setOriginStatus(requestOrigin, "pending");
        deleteClientId(requestOrigin);
        if (requestOptions?.isLastAttempt) {
          throw new Error("Origin is not an MTE Relay server.");
        }
        return await sendMteRequest(url, mteHeaders, options, mteOptions, {
          revalidateServer: true,
          isLastAttempt: true,
        });
      }

      // replace this pair with a new one
      deletePairIdFromQueue(requestOrigin, pairId);
      pairWithOrigin(requestOrigin, mteHeaders.relayHeader, 1);
      if (!requestOptions?.isLastAttempt) {
        return await sendMteRequest(url, mteHeaders, options, mteOptions, {
          isLastAttempt: true,
        });
      }
    }

    // else return error
    if (error instanceof Error) {
      throw error;
    }
    throw Error("An unknown error occurred.");
  }
}

/**
 * Make a HEAD request to check for x-mte-id response header,
 * If it exists, we assume the origin is an mte relay server.
 */
async function validateRemoteIsMteRelay(
  origin: string,
  relayHeader: string
): Promise<OriginStatus> {
  const headers: Record<string, string | string[]> = {};
  const clientId = getClientId(origin);
  if (clientId) {
    headers[relayHeader] = clientId;
  }
  const response = await fetch(origin + "/api/mte-relay", {
    method: "HEAD",
    headers,
  });

  if (MteRelayError.isMteErrorStatus(response.status)) {
    throw new MteRelayError(
      MteRelayError.getStatusErrorMessages(response.status)!
    );
  }

  if (!response.ok) {
    throw new Error("Origin is not an MTE Relay origin. Response not ok.");
  }
  const mteRelayHeaders = response.headers.get(relayHeader);
  if (!mteRelayHeaders) {
    throw new Error(
      "Origin is not an MTE Relay origin. Response missing header."
    );
  }
  const parsedRelayHeaders = parseMteRelayHeader(mteRelayHeaders);
  if (!parsedRelayHeaders.clientId) {
    throw new Error(
      `Response is missing clientId from header. Response missing ClientId.`
    );
  }
  setClientId(origin, parsedRelayHeaders.clientId);
  setOriginStatus(origin, "pending");
  return "pending";
}

/**
 * Pair with Server MTE Translator
 */
async function pairWithOrigin(
  origin: string,
  relayHeader: string,
  numberOfPairs?: number
) {
  const clientId = getClientId(origin);
  if (!clientId) {
    throw new Error("Client ID is not set.");
  }
  const initValues = [];
  const kyber = [];

  let i = 0;
  const iMax = numberOfPairs || NUMBER_OF_PAIRS;
  for (; i < iMax; ++i) {
    const pairId = generateRandomId();
    const encoderPersonalizationStr = generateRandomId();
    const encoderKyber = getKyberInitiator();
    const decoderPersonalizationStr = generateRandomId();
    const decoderKyber = getKyberInitiator();

    initValues.push({
      pairId,
      encoderPersonalizationStr,
      encoderPublicKey: encoderKyber.publicKey,
      decoderPersonalizationStr,
      decoderPublicKey: decoderKyber.publicKey,
    });

    kyber.push({ encoderKyber, decoderKyber });
  }

  const response = await fetch(`${origin}/api/mte-pair`, {
    headers: {
      [relayHeader]: clientId,
      "Content-Type": "application/json",
    },
    method: "POST",
    body: JSON.stringify(initValues),
  });
  if (!response.ok) {
    throw new Error(
      "Failed to pair with server MTE Translator. Response not ok."
    );
  }
  const mteRelayHeaders = response.headers.get(relayHeader);
  if (!mteRelayHeaders) {
    throw new Error(`Response is missing header: ${relayHeader}`);
  }
  const parsedRelayHeaders = parseMteRelayHeader(mteRelayHeaders);
  setClientId(origin, parsedRelayHeaders.clientId!);

  // convert response to json
  const pairResponseData: {
    pairId: string;
    encoderSecret: string;
    encoderNonce: string;
    decoderSecret: string;
    decoderNonce: string;
  }[] = await response.json();

  let j = 0;
  const jMax = pairResponseData.length;
  for (; j < jMax; ++j) {
    const _kyber = kyber[j];
    const pairInit = initValues[j];
    const pairResponse = pairResponseData[j];

    // create entropy
    const encoderEntropy = _kyber.encoderKyber.decryptSecret(
      pairResponse.decoderSecret
    );
    const decoderEntropy = _kyber.decoderKyber.decryptSecret(
      pairResponse.encoderSecret
    );

    // create encoder/decoder
    await instantiateEncoder({
      id: `encoder.${origin}.${pairResponse.pairId}`,
      entropy: encoderEntropy,
      nonce: pairResponse.decoderNonce,
      personalization: pairInit.encoderPersonalizationStr,
    });
    addPairIdToQueue(origin, pairResponse.pairId);

    await instantiateDecoder({
      id: `decoder.${origin}.${pairResponse.pairId}`,
      entropy: decoderEntropy,
      nonce: pairResponse.encoderNonce,
      personalization: pairInit.decoderPersonalizationStr,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
