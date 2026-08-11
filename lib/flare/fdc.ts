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
 * Candidate Coston2 FDC relay hosts, tried in order. The `-test` subdomain
 * has been decommissioned (DNS ERR_NAME_NOT_RESOLVED as of Aug 2026), so we
 * try the current candidates too. Override with NEXT_PUBLIC_FDC_RELAY to pin
 * the exact live host from the deploy env (e.g. Render dashboard).
 */
export const FDC_RELAY_CANDIDATES: string[] = [
  process.env.NEXT_PUBLIC_FDC_RELAY?.replace(/\/$/, "") ||
    "https://coston2-fdc.flare.network",
  "https://coston2-fdc-test.flare.network",
  "https://coston2-api.flare.network/fdc",
  COSTON2_FDC_RELAY.replace(/\/$/, ""),
].filter(Boolean);

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
 * Copy-ready `cast send` for an FDC Web2Json attestation request.
 *
 * Honest note: the Coston2 FDC relay (coston2-fdc-test.flare.network) is
 * currently down (DNS ERR_NAME_NOT_RESOLVED), and the public Web2Json source
 * `PublicWeb2` sourceId is registry-registered (not derivable without the
 * relay), so an in-browser auto-submit is not possible right now. This command
 * lets the user submit a REAL on-chain FdcHub.requestAttestation(bytes) request
 * from their own wallet/cli — requestAttestation stores the bytes regardless of
 * fee-config support, so the request is genuinely anchored on-chain. Fulfillment
 * depends on Coston2's current Web2Json source whitelist.
 */
export function buildFdcCastCommand(agentUrl: string, valueC2flr = "0.01"): string {
  const requestBytes = encodeWeb2JsonRequest(agentUrl);
  const calldata = requestAttestationCalldata(requestBytes);
  return [
    `cast send ${FDC_HUB}`,
    `requestAttestation(bytes) ${calldata}`,
    `--value ${valueC2flr}ether`,
    `--rpc-url https://coston2-api.flare.network/ext/C/rpc`,
    `--private-key $YOUR_COSTON2_KEY`,
  ].join(" \\\n  ");
}


export function fdcClient() {
  return createPublicClient({ chain: flareTestnet, transport: http(COSTON2_DEFAULT_RPC) });
}
