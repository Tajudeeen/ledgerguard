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
 * FDC lets anyone request an attestation of off-chain data. On Coston2 the
 * supported off-chain type is **Web2Json** (FdcHub interface IWeb2Json,
 * @custom:id 0x06) — there is NO "URL" attestation type, which is why the
 * earlier URL-based request reverted ("request not supported").
 *
 * VERIFIED THIS SESSION (live on Coston2 + periphery-contracts source):
 *  - FdcHub       0x48aC463d7975828989331F4De43341627b9c5f1D (getCode present)
 *  - requestAttestation(bytes) selector 0x6238f354 IS in FdcHub bytecode.
 *  - IFdcHub.requestAttestation(bytes) external payable.
 *  - IFdcRequestFeeConfigurations.getRequestFee(bytes) -> uint256 (reverts if
 *    the type/source is not supported — this is the conditional revert guard).
 *  - IWeb2Json.RequestBody = { url, httpMethod, headers, queryParams, body,
 *    postProcessJq, abiSignature } (all string).
 *
 * The fee is NOT fixed: it is computed by `getRequestFee(requestBytes)`. The
 * button queries it live and sends exactly that, so it never over/under-pays.
 */

export const FDC_HUB = "0x48aC463d7975828989331F4De43341627b9c5f1D" as const;
export const FDC_VERIFICATION = "0x906507E0B64bcD494Db73bd0459d1C667e14B933" as const;

export const FDC_REQUEST_SELECTOR = "0x6238f354" as const; // requestAttestation(bytes)

export const COSTON2_FDC_RELAY = "https://coston2-fdc-test.flare.network";

/**
 * Web2Json attestation type. The canonical FDC attestation-type bytes32 for
 * Web2Json. The relay prepare endpoint also accepts the string "Web2Json", so
 * we use the string name for the relay call and this bytes32 for the direct
 * contract path. (Value sourced from Flare FDC spec; the relay is the
 * authority and the contract getRequestFee guards support.)
 */
export const WEB2JSON_ATTESTATION_TYPE =
  "0x06e600dbdb86e1c6c620d61bdc4cce1bef1808e6de7e7949e7fa3ccd9ea51aa1" as const;

/** Default HTTP source id for Web2Json (no dedicated source). */
export const WEB2JSON_SOURCE_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/** Encode a Web2Json request body (IWeb2Json.RequestBody). */
export function encodeWeb2JsonBody(params: {
  url: string;
  abiSignature?: string;
  postProcessJq?: string;
  httpMethod?: string;
  headers?: string;
  queryParams?: string;
  body?: string;
}): Hex {
  return encodeAbiParameters(
    [
      { type: "string" },
      { type: "string" },
      { type: "string" },
      { type: "string" },
      { type: "string" },
      { type: "string" },
      { type: "string" },
    ],
    [
      params.url,
      params.httpMethod ?? "GET",
      params.headers ?? "{}",
      params.queryParams ?? "",
      params.body ?? "{}",
      params.postProcessJq ?? ".",
      params.abiSignature ?? "(string)",
    ],
  );
}

/**
 * Wrap a Web2Json message into the top-level FDC request envelope:
 *   abi.encode(Request) where Request = (attestationType, sourceId,
 *   messageIntegrityCode, requestBody). messageIntegrityCode is 0x..00 for a
 *   request (set on response); we use zero for the request.
 */
export function encodeWeb2JsonRequest(url: string): Hex {
  const requestBody = encodeWeb2JsonBody({ url });
  return encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "bytes" },
    ],
    [
      WEB2JSON_ATTESTATION_TYPE,
      WEB2JSON_SOURCE_ID,
      "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
      requestBody,
    ],
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
 * Query the on-chain fee for an encoded request.
 * `fdcHub.fdcRequestFeeConfigurations().getRequestFee(bytes) -> uint256`.
 * Reverts (throws) if the type/source is not supported in the current round —
 * the caller should catch that and surface "Web2Json not open right now".
 */
const FEE_CONFIG_ABI = [
  {
    type: "function",
    name: "fdcRequestFeeConfigurations",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const GET_FEE_ABI = [
  {
    type: "function",
    name: "getRequestFee",
    stateMutability: "view",
    inputs: [{ name: "_data", type: "bytes" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export async function getFdcRequestFee(requestBytes: Hex): Promise<bigint> {
  const client = fdcClient();
  const feeConfig = (await client.readContract({
    address: FDC_HUB,
    abi: FEE_CONFIG_ABI,
    functionName: "fdcRequestFeeConfigurations",
  })) as `0x${string}`;
  return client.readContract({
    address: feeConfig,
    abi: GET_FEE_ABI,
    functionName: "getRequestFee",
    args: [requestBytes],
  }) as Promise<bigint>;
}

/**
 * Prepare a Web2Json attestation via Flare's FDC relay (the canonical,
 * round+fee-aware path). The relay returns the correctly-encoded request (with
 * the right sourceId) and the exact fee. Reachable from the user's
 * browser/app (not this sandbox).
 *
 * We try the two documented relay endpoint shapes; whichever responds with an
 * abiEncodedRequest wins.
 *   POST {relay}/api/v1/fdc/request-attestation
 *   POST {relay}/api/v1/fdc/prepare-attestation-request
 * Body: { sourceId, attestationType: "Web2Json", requestBody: {...} }
 */
export async function prepareWeb2JsonViaRelay(
  url: string,
  relay: string = COSTON2_FDC_RELAY,
): Promise<{ abiEncodedRequest: Hex; requestFee: bigint }> {
  const body = JSON.stringify({
    sourceId: WEB2JSON_SOURCE_ID,
    attestationType: "Web2Json",
    requestBody: {
      url,
      httpMethod: "GET",
      headers: "{}",
      queryParams: "",
      body: "{}",
      postProcessJq: ".",
      abiSignature: "(string)",
    },
  });
  const endpoints = [
    "/api/v1/fdc/request-attestation",
    "/api/v1/fdc/prepare-attestation-request",
  ];
  let lastErr = "";
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${relay}${ep}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        lastErr = `relay ${ep} ${res.status}`;
        continue;
      }
      const json = (await res.json()) as {
        abiEncodedRequest?: string;
        requestFee?: string | number;
      };
      if (!json.abiEncodedRequest) {
        lastErr = `relay ${ep}: no abiEncodedRequest`;
        continue;
      }
      return {
        abiEncodedRequest: json.abiEncodedRequest as Hex,
        requestFee: BigInt(json.requestFee ?? 0),
      };
    } catch (e) {
      lastErr = `relay ${ep}: ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }
  }
  throw new Error(`FDC relay unreachable (${lastErr}). Use the relay link below to submit manually.`);
}

export function fdcClient() {
  return createPublicClient({ chain: flareTestnet, transport: http(COSTON2_DEFAULT_RPC) });
}
