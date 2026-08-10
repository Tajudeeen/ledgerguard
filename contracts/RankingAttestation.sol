// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title RankingAttestation
/// @notice Immutable, append-only record of LedgerGuard agent-ranking snapshots
///         on Flare Coston2.
///
/// @dev Design notes:
///
///  - The contract stores a COMMITMENT, not the leaderboard. The full ranking
///    is deterministically reproducible from `snapshotBlock` by re-reading the
///    FXRP AssetManager at that block and re-running the open-source scoring
///    engine, so putting the rows on-chain would cost gas for no added trust.
///
///  - There is no owner, no admin, no pause and no upgrade path. Anyone may
///    attest, and nothing can be edited or deleted afterwards. An attestation
///    is a claim by its submitter, timestamped by the chain — it is deliberately
///    NOT a claim that the ranking is correct. Correctness is checked by
///    re-deriving the hash, which any third party can do without permission.
///
///  - `snapshotHash` is keccak256 over an abi.encode of the full ranking,
///    format "LEDGERGUARD-V1" (see lib/attestation/snapshot-hash.ts and
///    docs/SNAPSHOT-FORMAT.md). Because abi.encode has an exact byte layout,
///    the hash is reproducible across languages and implementations.
contract RankingAttestation {
    struct Attestation {
        bytes32 snapshotHash;
        uint64 snapshotBlock;
        uint64 attestedAt;
        uint32 agentCount;
        uint96 mintAmountUBA;
        address recommendedAgent;
        address submitter;
    }

    /// @notice All attestations ever submitted, in submission order.
    Attestation[] private _attestations;

    /// @notice First attestation id recorded for a given snapshot hash, +1.
    /// @dev Zero means "never attested". Stored +1 so id 0 is representable.
    mapping(bytes32 => uint256) private _firstSeen;

    event RankingAttested(
        uint256 indexed id,
        bytes32 indexed snapshotHash,
        address indexed submitter,
        uint64 snapshotBlock,
        uint64 attestedAt,
        uint32 agentCount,
        uint96 mintAmountUBA,
        address recommendedAgent
    );

    error EmptySnapshotHash();
    error NoAgents();
    error ZeroMintAmount();
    error SnapshotBlockInFuture();
    error UnknownAttestation();

    /// @notice Anchor a ranking snapshot.
    /// @param snapshotHash    keccak256 of the LEDGERGUARD-V1 encoding.
    /// @param snapshotBlock   Block all agent reads were pinned to.
    /// @param agentCount      Number of agents in the ranking.
    /// @param mintAmountUBA   Mint amount the ranking answers for, in UBA.
    /// @param recommendedAgent Agent vault ranked #1 (may be zero if none was
    ///                        eligible, which is itself a meaningful result).
    /// @return id The new attestation's id.
    function attest(
        bytes32 snapshotHash,
        uint64 snapshotBlock,
        uint32 agentCount,
        uint96 mintAmountUBA,
        address recommendedAgent
    ) external returns (uint256 id) {
        if (snapshotHash == bytes32(0)) revert EmptySnapshotHash();
        if (agentCount == 0) revert NoAgents();
        if (mintAmountUBA == 0) revert ZeroMintAmount();
        // A snapshot cannot have been taken at a block that does not exist yet.
        if (snapshotBlock > block.number) revert SnapshotBlockInFuture();

        id = _attestations.length;

        _attestations.push(
            Attestation({
                snapshotHash: snapshotHash,
                snapshotBlock: snapshotBlock,
                attestedAt: uint64(block.timestamp),
                agentCount: agentCount,
                mintAmountUBA: mintAmountUBA,
                recommendedAgent: recommendedAgent,
                submitter: msg.sender
            })
        );

        // Re-attesting an identical snapshot is allowed (it is harmless and
        // costs the submitter gas), but the earliest sighting is what proves
        // priority, so only the first is recorded here.
        if (_firstSeen[snapshotHash] == 0) {
            _firstSeen[snapshotHash] = id + 1;
        }

        emit RankingAttested(
            id,
            snapshotHash,
            msg.sender,
            snapshotBlock,
            uint64(block.timestamp),
            agentCount,
            mintAmountUBA,
            recommendedAgent
        );
    }

    /// @notice Total number of attestations recorded.
    function count() external view returns (uint256) {
        return _attestations.length;
    }

    /// @notice Read a single attestation by id.
    function get(uint256 id) external view returns (Attestation memory) {
        if (id >= _attestations.length) revert UnknownAttestation();
        return _attestations[id];
    }

    /// @notice Id of the earliest attestation of `snapshotHash`.
    /// @return found Whether the snapshot was ever attested.
    /// @return id    The earliest attestation id when `found` is true.
    function firstAttestationOf(bytes32 snapshotHash)
        external
        view
        returns (bool found, uint256 id)
    {
        uint256 stored = _firstSeen[snapshotHash];
        return stored == 0 ? (false, 0) : (true, stored - 1);
    }
}
