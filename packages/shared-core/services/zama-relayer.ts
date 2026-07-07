/**
 * ZamaRelayer — Phase 4 (Zama scaffolding) wrapper for the Zama
 * Relayer SDK. Single source of truth for the off-chain encrypt /
 * decrypt path; everything else goes through this one surface.
 *
 * Today the Zama fhEVM is pre-publication and no `@zama-fhe/relayer-sdk`
 * package is installed. The implementation behind `encryptFor` and
 * `decryptCipher` is therefore a deterministic mock:
 *
 *   - `encryptFor(handle, value)` returns a 32-byte big-endian hex
 *     string left-padded to 64 hex chars (the same shape a real
 *     Zama ciphertext handle will have). The `proof` field is a
 *     fixed `0x00` so the contract-side `proof` parameter is
 *     honoured without runtime cost.
 *   - `decryptCipher(handle)` parses the hex back to a `bigint`.
 *
 * The two-method surface is the only call site for FHE in the
 * entire codebase. When the real Zama Relayer SDK ships:
 *
 *   1. `npm install @zama-fhe/relayer-sdk` (or whatever the final
 *      package name is — `encrypted-types` was a working name in
 *      the 2025 Zama docs)
 *   2. Replace the bodies of `encryptFor` and `decryptCipher` with
 *      calls into the real SDK
 *   3. No other call site needs to change — `ConfidentialTerritoryService`
 *      and any future consumer goes through this single surface
 *
 * The mock keeps the surface stable so the on-chain `ConfidentialTerritoryDefense`
 * contract (which currently consumes plaintext-encoded mock values
 * via the Phase 4 `Mocks.sol` shim) can swap to real ciphertexts
 * with no consumer-side change.
 */
export interface ZamaCiphertext {
  /** 32-byte handle, left-padded to 64 hex chars (mock or real). */
  handle: string;
  /** ZK proof. The mock returns `0x00`; the real SDK returns a
   *  serialized ZK proof tied to `msg.sender` + the ciphertext. */
  proof: string;
}

export class ZamaRelayer {
  private static instance: ZamaRelayer;

  private constructor() {}

  static getInstance(): ZamaRelayer {
    if (!ZamaRelayer.instance) {
      ZamaRelayer.instance = new ZamaRelayer();
    }
    return ZamaRelayer.instance;
  }

  /**
   * Encrypt `value` for the on-chain `ConfidentialTerritoryDefense`
   * contract. The single call site for FHE in the codebase.
   *
   * Mock mode (default): pads the value to 32 bytes and returns it
   * as the handle. The `proof` field is a fixed zero so the
   * contract's `bytes calldata proof` parameter is satisfied.
   *
   * @param handle  Optional pre-existing handle. The mock ignores
   *                this; the real SDK uses it as the relayer's
   *                session handle. Today the relayer SDK API
   *                (TBD) is expected to accept the handle as a
   *                contract address + ACL key.
   * @param value   The plaintext value to encrypt. `bigint` keeps
   *                the path open for ciphertext-of-ciphertext
   *                operations (Phase 5+).
   */
  public async encryptFor(handle: string, value: number | bigint): Promise<ZamaCiphertext> {
    // Mock: deterministic 32-byte big-endian hex of the value.
    // The `handle` parameter is currently unused but kept in the
    // signature for forward-compatibility with the real Zama
    // relayer SDK (which takes a handle to bind the ciphertext
    // to a specific contract storage slot).
    handle;
    const v = typeof value === 'bigint' ? value : BigInt(value);
    const hex = v.toString(16).padStart(64, '0');
    return {
      handle: `0x${hex}`,
      proof: '0x00',
    };
  }

  /**
   * Decrypt a ciphertext handle. Today the mock is a 32-byte big-endian
   * hex parse. The real SDK will require an ACL check (only the
   * owner of the underlying value can decrypt).
   */
  public async decryptCipher(handle: string): Promise<bigint> {
    const hex = handle.startsWith('0x') ? handle.slice(2) : handle;
    if (hex.length !== 64) {
      throw new Error(`ZamaRelayer: invalid handle length (${hex.length}, expected 64 hex chars)`);
    }
    return BigInt(`0x${hex}`);
  }

  /**
   * Read-only summary of the relayer's mode. Useful for the wallet
   * UI ("Confidential shield: mock / live" badge) and for the
   * `/api/runs` health endpoint.
   */
  public summary(): { mode: 'mock' | 'live' } {
    // Phase 4: only mock. Phase 5+ will flip to `live` once the
    // Zama Relayer SDK is installed and `encryptFor` / `decryptCipher`
    // are rewired to the real package.
    return { mode: 'mock' };
  }
}
