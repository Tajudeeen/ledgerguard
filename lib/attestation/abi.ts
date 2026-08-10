/** ABI of contracts/RankingAttestation.sol (see build/RankingAttestation.json). */
export const ATTESTATION_ABI = [
  {
    type: "function",
    name: "attest",
    stateMutability: "nonpayable",
    inputs: [
      { name: "snapshotHash", type: "bytes32" },
      { name: "snapshotBlock", type: "uint64" },
      { name: "agentCount", type: "uint32" },
      { name: "mintAmountUBA", type: "uint96" },
      { name: "recommendedAgent", type: "address" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "count",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "get",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "snapshotHash", type: "bytes32" },
          { name: "snapshotBlock", type: "uint64" },
          { name: "attestedAt", type: "uint64" },
          { name: "agentCount", type: "uint32" },
          { name: "mintAmountUBA", type: "uint96" },
          { name: "recommendedAgent", type: "address" },
          { name: "submitter", type: "address" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "firstAttestationOf",
    stateMutability: "view",
    inputs: [{ name: "snapshotHash", type: "bytes32" }],
    outputs: [
      { name: "found", type: "bool" },
      { name: "id", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "RankingAttested",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "snapshotHash", type: "bytes32", indexed: true },
      { name: "submitter", type: "address", indexed: true },
      { name: "snapshotBlock", type: "uint64", indexed: false },
      { name: "attestedAt", type: "uint64", indexed: false },
      { name: "agentCount", type: "uint32", indexed: false },
      { name: "mintAmountUBA", type: "uint96", indexed: false },
      { name: "recommendedAgent", type: "address", indexed: false },
    ],
  },
] as const;

// Deployed RankingAttestation on Coston2 (verified live: 17 attestations).
// Hardcoded as a safe default so the on-chain anchor works even if the
// build environment did not supply NEXT_PUBLIC_ATTESTATION_ADDRESS (Next.js
// inlines NEXT_PUBLIC_* at build time, so a missing build-time var bakes in
// null and breaks anchoring). The env var still overrides this when present.
export const ATTESTATION_ADDRESS =
  process.env.NEXT_PUBLIC_ATTESTATION_ADDRESS ??
  "0x2b38cc9b84bd3a568ccc7817b10dc98c8abdab36";
