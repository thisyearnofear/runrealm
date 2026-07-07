// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Mocks.sol — Phase 4 (Zama scaffolding) FHE type shim
 * @dev Local-dev + Hardhat shim for the Zama fhEVM `euint32` / `euint16`
 * / `euint8` types and the `TFHE.*` library surface.
 *
 * The Zama fhEVM mainnet / testnet is pre-publication (as of July 2026),
 * so no `@zama-fhe/solidity` package is installed. This file mirrors
 * the public Zama surface as plain Solidity value types + library
 * calls so the `ConfidentialTerritoryDefense` contract compiles and
 * tests locally without any FHE dependency.
 *
 * Migration path: when Zama publishes its solidity library, replace
 * the `type euint32 is uint256` declarations with the real Zama
 * `euint32` type (and re-export `TFHE` from the real package). The
 * contract body does not need to change — the API surface is
 * intentionally identical.
 *
 * Type design:
 *  - `euint32` is a Solidity "user defined value type" wrapping a
 *    `uint256`. Same shape Zama's docs use for their mock library
 *    (see https://docs.zama.ai/fhevm for the upstream pattern).
 *  - `euint16` and `euint8` are not used by `ConfidentialTerritoryDefense`
 *    but are included for completeness so future Phase 4+ work
 *    (e.g. encrypted difficulty on the `ConfidentiaRunRealm`
 *    scaffold) can drop in without touching this file again.
 */
type euint32 is uint256;
type euint16 is uint256;
type euint8  is uint256;

/**
 * @dev Mock `TFHE` library. Every function is plain arithmetic /
 * comparison / bitwise over the underlying `uint256`. The real Zama
 * `TFHE` library exposes the same surface but with ciphertext
 * homomorphic operations.
 */
library TFHE {
    /*//////////////////////////////////////////////////////////////
                              ARITHMETIC
    //////////////////////////////////////////////////////////////*/

    function add(euint32 a, euint32 b) internal pure returns (euint32) {
        return euint32.wrap(euint32.unwrap(a) + euint32.unwrap(b));
    }

    function sub(euint32 a, euint32 b) internal pure returns (euint32) {
        return euint32.wrap(euint32.unwrap(a) - euint32.unwrap(b));
    }

    /// @dev Subtract with a floor at 0. Matches the real Zama
    /// `TFHE.sub` semantics for the activity-decay use case where
    /// a territory that would go negative just sits at 0.
    function subFloor(euint32 a, euint32 b) internal pure returns (euint32) {
        uint256 av = euint32.unwrap(a);
        uint256 bv = euint32.unwrap(b);
        return euint32.wrap(av > bv ? av - bv : 0);
    }

    /// @dev Min-of-two ciphertexts. The real Zama lib exposes
    /// `TFHE.min`; we implement it here as `a < b ? a : b`.
    function min(euint32 a, euint32 b) internal pure returns (euint32) {
        return euint32.unwrap(a) < euint32.unwrap(b) ? a : b;
    }

    /*//////////////////////////////////////////////////////////////
                              COMPARISON
    //////////////////////////////////////////////////////////////*/

    function gt(euint32 a, euint32 b) internal pure returns (bool) {
        return euint32.unwrap(a) > euint32.unwrap(b);
    }

    function lt(euint32 a, euint32 b) internal pure returns (bool) {
        return euint32.unwrap(a) < euint32.unwrap(b);
    }

    function eq(euint32 a, euint32 b) internal pure returns (bool) {
        return euint32.unwrap(a) == euint32.unwrap(b);
    }

    /*//////////////////////////////////////////////////////////////
                               DECRYPT
    //////////////////////////////////////////////////////////////*/

    /// @dev Mock-decrypt. The real Zama lib requires an ACL check
    /// (`TFHE.decrypt` reverts unless `msg.sender` is allowed to
    /// decrypt the handle). Under the mock shim, decryption is
    /// a no-op cast to `uint32`. This is the right semantic for
    /// local dev but MUST be replaced with the real ACL-gated
    /// decrypt when the Zama lib is wired in.
    function decrypt(euint32 a) internal pure returns (uint32) {
        return uint32(euint32.unwrap(a));
    }

    /// @dev Optional `einput` / `euint32` conversion. The real Zama
    /// type system distinguishes between an encrypted input (which
    /// needs an attached ZK proof) and a stored ciphertext. Under
    /// the mock shim, `asEuint32` is a direct cast.
    function asEuint32(uint32 value) internal pure returns (euint32) {
        return euint32.wrap(uint256(value));
    }
}
