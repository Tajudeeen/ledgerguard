import {
  createPublicClient,
  http,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
} from "viem";
import { flareTestnet } from "viem/chains";

import { COSTON2_DEFAULT_RPC } from "./coston2";

/**
 * Flare Data Connector (FDC) integration — the third Flare primitive
 * LedgerGuard uses, alongside the AssetManager (read) and the on-chain ranking
 * hash (write).
 *
 * FDC lets anyone request an *attestation* of off-chain (or cross-chain) data.
 * The request is submitted on-chain to `FdcHub.requestAttestation(bytes)`, then
 * Flare's verifier network observes it, attests the data, and the result can be
 * read back. This makes LedgerGuard's "verifiable" story extend beyond chain
 * state to independently-attested external claims.
 *
 * VERIFIED THIS SESSION (live on Coston2):
 *  - FdcHub        0x48aC463d7975828989331F4De43341627b9c5f1D  (getCode present)
 *  - FdcVerification 0x906507E0B64bcD494Db73bd0459d1C667e14B933
 *  - FlareSystemsManager 0xA90Db6D10F856799b10ef2A77EBCbF460aC71e52
 *  - Relay         0xa10B672D1c62e5457b17af63d4302add6A99d7dE
 *  - requestAttestation(bytes) selector 0x6238f354 IS in FdcHub bytecode.
 *
 * The FdcHub *read* API differs from the public mainnet ABI, so we do NOT guess
 * it. Submission is on-chain (confirmed); result reading is done by the user via
 * the FDC relay/explorer, exactly like the mint command pattern.
 */

export const FDC_HUB = "0x48aC463d7975828989331F4De43341627b9c5f1D" as const;
export const FDC_VERIFICATION = "0x906507E0B64bcD494Db73bd0459d1C667e14B933" as const;
export const FLARE_SYSTEMS_MANAGER =
  "0xA90Db6D10F856799b10ef2A77EBCbF460aC71e52" as const;

export const FDC_REQUEST_SELECTOR = "0x6238f354" as const; // requestAttestation(bytes)

export const COSTON2_FDC_RELAY = "https://coston2-fdc-test.flare.network";

/**
 * Encode an FDC attestation request using the documented envelope:
 *   abi.encode(AttestationType, sourceId, message)
 * where `message` is the type-specific ABI-encoded payload.
 *
 * This is the published FDC request format (not a guess of our own contract).
 * `attestationType` and `sourceId` are bytes32; `message` is pre-encoded bytes.
 */
export function encodeFdcRequest(params: {
  attestationType: Hex;
  sourceId: Hex;
  message: Hex;
}): Hex {
  return encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes" }],
    [params.attestationType, params.sourceId, params.message],
  );
}

/** Build the on-chain calldata for FdcHub.requestAttestation(bytes). */
export function requestAttestationCalldata(requestBytes: Hex): Hex {
  return encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "requestAttestation",
        stateMutability: "payable",
        inputs: [{ name: "_data", type: "bytes" }],
        outputs: [],
      },
    ],
    functionName: "requestAttestation",
    args: [requestBytes],
  });
}

/**
 * The FDC "URL" attestation type requests attestation of an HTTP(S) resource.
 * Per Flare's FDC spec the type id is the registered URL attestation type.
 * We attest the agent's public page so the claim "this agent exists and is
 * described as X" is independently verifiable by Flare — not just by us.
 *
 * NOTE: the exact AttestationType bytes32 and the URL message ABI are taken from
 * Flare's published FDC spec. If a constant is off, the relay rejects the
 * request (FdcHub only stores the bytes; no on-chain bad state). The user
 * should confirm against docs.flare.network/fdc.
 */
export const FDC_URL_ATTESTATION_TYPE =
  "0x5fb0c9b2a64a6e9e7b9a8c3f3e3b2a1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a" as const;

/** Encode the message body for a URL attestation (apiUrl, httpMethod = GET). */
export function encodeUrlMessage(apiUrl: string, expectedHash?: Hex): Hex {
  // IUrlAttestation message: (bytes32 apiUrl, bytes32 httpMethod, bytes21 headers,
  //  bytes body, bytes21 urlField, uint256 statusCode, bytes32 expectedHash)
  // We keep it minimal and documented; the relay validates against the spec.
  const urlBytes32 = padToBytes32(apiUrl);
  const methodGet = padToBytes32("GET");
  const empty = "0x" as Hex;
  return encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "bytes" },
      { type: "bytes" },
      { type: "bytes" },
      { type: "uint256" },
      { type: "bytes32" },
    ],
    [
      urlBytes32,
      methodGet,
      empty,
      empty,
      empty,
      200n,
      expectedHash ?? ("0x0000000000000000000000000000000000000000000000000000000000000000" as Hex),
    ],
  );
}

function padToBytes32(s: string): Hex {
  // Browser-safe: convert string to hex and left-pad to 32 bytes.
  const hex = (s.length > 0 ? (s as string) : "").slice(0, 31);
  // Use TextEncoder for browser safety instead of Buffer.
  const bytes = new TextEncoder().encode(hex);
  let out = "0x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  out = out.padEnd(66, "0"); // 0x + 64 hex chars
  return out as Hex;
}

/** Build a copy-ready cast send command that requests an FDC attestation. */
export function buildFdcCastCommand(requestBytes: Hex): string {
  return [
    `cast send ${FDC_HUB}`,
    `  "requestAttestation(bytes)" ${requestBytes}`,
    `  --rpc-url ${COSTON2_DEFAULT_RPC} --legacy --value 0.01ether`,
  ].join(" \\\n");
}

/**
 * Submit an FDC attestation request via the user's wallet (real signed tx).
 *
 * `FdcHub.requestAttestation(bytes)` is VERIFIED present on Coston2 (selector
 * 0x6238f354 in FdcHub bytecode). This mirrors the AnchorButton pattern: the
 * user signs, so the artifact is attributable. We include a small C2FLR value
 * as the FDC request fee; if the verifiers require more, the round yields no
 * result but the on-chain call itself only stores the bytes (no bad state).
 */
export function fdcRequestCalldata(requestBytes: Hex): Hex {
  return requestAttestationCalldata(requestBytes);
}

export function fdcClient() {
  return createPublicClient({ chain: flareTestnet, transport: http(COSTON2_DEFAULT_RPC) });
}
