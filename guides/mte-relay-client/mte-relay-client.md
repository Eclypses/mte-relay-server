# Write an MTE Relay Client

This guide will walk through all the steps it takes to write your own MTE Relay Client in any language.

## Introduction

An MTE Relay Client is responsible for creating encoder / decoder pairs with an MTE Relay server, managing their state, encoding requests, and decoding responses.

## Headers

MTE Relay Server relies on four header values that should be included on every request.

- `x-mte-relay-server-id`
  - This is a GUID issued by the server, and it is returned on all responses.
- `x-mte-relay-client-id`
  - This is a GUID issued by the server, and signed with a server side secret
  - The client should maintain this value locally, and include it on every request
- `x-mte-relay-session-id`
  - This is a GUID created by the client and included on every request
  - The session ID has a 1-to-1 relationship with an encoder/decoder pair.
  - The client can update this ID at any time and repair to create a new encoder/decoder pair
- `x-mte-relay-eh`
  - The Encoded Headers header.
  - This value should contain an object of key:value pairs of headers that were JSON serialized into a string and MKE encoded.
  - If the request / response has a body, this value should contain the content-type of the body.
  - Optionally, it may contain other headers as well.

## API Endpoints

MTE Relay Server exposes 2 APIs that the client must interact with before being able to send MTE Encoded requests.

### `HEAD /api/mte-relay`

This should be the first request you make, and if the request is successful, then the server is a verified MTE Relay server.

#### Request

- Method: HEAD
- Headers:
  - `x-mte-relay-client-id` [OPTIONAL] If you were assigned a client ID in a previous session, it should be maintained locally and included in this request. If you do not have a clientID, omit this header and you will be assigned a new one in the response headers.

Example:

```bash
curl --location --head 'https://mte-relay-server.domain.com/api/mte-relay' \
--header 'x-mte-relay-client-id: 3cc660bd-9af4-4021-bcbc-c115cdcc8260.67a0f3db628748df575760f973c0ac559b8d0554eeaa54a0452a3d215f7ef901'
```

#### Response

- If this response is not successful, this is not an MTE Relay Server, and you should throw an error.
- If this is successful, it is an MTE Relay Server, and you may request to create Encoder/Decoder pairs with this server.
- This request can be considered successful if
  - It's status is 200
  - It contains the headers
    - `x-mte-relay-server-id`
    - `x-mte-relay-client-id` - Save this ID an include it on every future request. This is how the server identifies unique connecting clients.

### `POST /api/mte-pair`

Use this API to exchange instantiation data and create a new encoder/decoder pair with the server.

#### Request

- Method: POST
- Headers:
  - `x-mte-relay-client-id`
    - Required.
    - Use the value assigned by `/api/mte-relay`
  - `x-mte-relay-session-id`
    - Required
    - Create this on the client.
    - This value is tied to the encoder/decoder pair created by this API.
    - If this value is ever changed, you will need to call this API with the new value to create new encoder/decoder pairs using this session ID.
- Body:
  - `encoderPersonalizationStr` The client-side encoder's personalization string
  - `encoderPublicKey` The client-side encoder's ECDH public key, as aBase64 string
  - `decoderPersonalizationStr` The client-side decoder's personalization string
  - `decoderPublicKey` The client-side decoder's ECDH public key, as aBase64 string

Example Curl:

```bash
curl --location 'http://127.0.0.1:8080/api/mte-pair' \
--header 'x-mte-relay-client-id: 3cc660bd-9af4-4021-bcbc-c115cdcc8260.67a0f3db628748df575760f973c0ac559b8d0554eeaa54a0452a3d215f7ef901' \
--header 'x-mte-relay-session-id: VDWXXi7RparXDWi0HZghQNUfwJyhVFJTGvwZ' \
--header 'Content-Type: application/json' \
--data '{"encoderPersonalizationStr":"i7sP5zyRPAjqHzP7xXrmmxQ9exvanmbv9D9Z","encoderPublicKey":"BAEFsKkl2yLGp+5Ajr0+DgoaBROhZSaEnE4MT6xca1ahNLvUomQwOebTjDsKhwkTsAZtsDX3mbT/ZYyHQcK/tck=","decoderPersonalizationStr":"JCtwalAj4UwXc2Hr3yLEzAsx7N4l8pxfUL8e","decoderPublicKey":"BEvfJoctdqgYxCHSxEsQzLll5hqk7sh50GFv3XG8EwK5fWdwcmEENhf4E1CtAGD9ywPHjtnz8iel5HWaoDzU58o="}'
```

#### Response:

The response should include:

- Status 200
- Headers:
  - `x-mte-relay-server-id`
  - `x-mte-relay-client-id`
  - `x-mte-relay-session-id`
- JSON Body:
  - `encoderNonce` The server-side encoder's nonce string
  - `encoderPublicKey` The server-side encoder's ECDH public key, as aBase64 string
  - `decoderNonce` The server-side decoder's nonce string
  - `decoderPublicKey` The server-side decoder's ECDH public key, as aBase64 string

Example:

```bash
{
    "encoderNonce": "5473069918238",
    "encoderPublicKey": "BEhcMrY8IBBAn0oHQDNFiyw3tCXWr6s83eaqFbbPTFUzpaxNR4P1svv64cDFOv2Kbu1o5vSSNKVJTzLWXOvOUFw=",
    "decoderNonce": "37615310760989",
    "decoderPublicKey": "BFVHBOgSHe0nXao4PJGBIGCoOsKt3L6UC2SppuQLIvHWxWX+jUeOwNBox6Or3OEre2gCroEfDke8MWFigInONTw="
}
```

#### Creating an Encoder / Decoder

After sending this `/api/mte-pair` request successfully, both sides should have enough data to create encoder decoder pairs. Combine the client-encoder values with the server-decoder values, and vice-versa to create the correct pairs.

#### Saving MTE State

The ID headers should be used for maintaining MTE State. The formula for saving MTE state should be:

- encoder.severId.sessionId
  - `encoder.fc16d510-0bbb-11ee-be56-0242ac120002.0498200e-0bbc-11ee-be56-0242ac120002`
- decoder.serverId.sessionId
  - `decoder.fc16d510-0bbb-11ee-be56-0242ac120002.0498200e-0bbc-11ee-be56-0242ac120002`

## Proxying Requests with MTE Relay

### Encode Headers

If the request has a body it should also have a `Content-Type` header. You need to add that header to a object or dictionary that can be JSON serialized into a string. Optionally, add any other headers to this object to be encoded.

```javascript
const headersToEncode = {
  "Content-Type": "application/json",
  Authorization: "Bearer PD&meEB0tJkS$1#oufw3K2G7@pTC9Nac",
};
const encodedHeadersStr = JSON.stringify(headersToEncode);
```

MKE encode the above string and attach it to the request under the header `x-mte-relay-eh`

```javascript
request.headers["x-mte-relay-eh"] = mkeEncode(encodedHeadersStr);
```

### Encode Request Body

If the request has a body, simply mke encode the body and attach it as the body of the request.

### Send request with correct headers
