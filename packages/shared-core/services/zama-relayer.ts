/**
 * ZamaRelayer — the single off-chain FHE surface for RunRealm.
 *
 * Wraps the Zama Protocol Relayer SDK (`@zama-fhe/relayer-sdk`) so the
 * rest of the app has exactly one place that:
 *
 *   1. loads the TFHE WASM (`initSDK`),
 *   2. creates a `FhevmInstance` bound to the wallet provider
 *      (`createInstance({ ...SepoliaConfig, network })`),
 *   3. encrypts a `uint32` input for a contract call
 *      (`createEncryptedInput(...).add32(v).encrypt()`), and
 *   4. user-decrypts a ciphertext handle the caller is authorized to
 *      read (EIP-712 permit + `instance.userDecrypt`), or
 *      public-decrypts a handle that was made publicly decryptable
 *      (`instance.publicDecrypt`).
 *
 * The SDK ships WASM + web workers, so it is imported lazily (dynamic
 * `import()`), keeping it out of the mobile/Node bundles and off the
 * critical path until the user actually opens the confidential shield.
 *
 * This is the real thing — there is no mock. Against a local Hardhat
 * node the on-chain side is exercised by the `@fhevm/hardhat-plugin`
 * mock coprocessor in the Solidity test suite; in the browser this
 * talks to the live Zama relayer for Sepolia.
 */
import type { Signer } from 'ethers';

/** Minimal shape of the pieces of the Relayer SDK we use. */
interface FhevmEncryptedInput {
  add32(value: number | bigint): FhevmEncryptedInput;
  encrypt(): Promise<{ handles: Uint8Array[] | string[]; inputProof: Uint8Array | string }>;
}
interface FhevmKeypair {
  publicKey: string;
  privateKey: string;
}
interface FhevmEIP712 {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  message: Record<string, unknown>;
}
interface FhevmInstance {
  createEncryptedInput(contractAddress: string, userAddress: string): FhevmEncryptedInput;
  generateKeypair(): FhevmKeypair;
  createEIP712(
    publicKey: string,
    contractAddresses: string[],
    startTimestamp: string,
    durationDays: string
  ): FhevmEIP712;
  userDecrypt(
    handleContractPairs: { handle: string; contractAddress: string }[],
    privateKey: string,
    publicKey: string,
    signature: string,
    contractAddresses: string[],
    userAddress: string,
    startTimestamp: string,
    durationDays: string
  ): Promise<Record<string, bigint | boolean | string>>;
  publicDecrypt(handles: string[]): Promise<Record<string, bigint | boolean | string>>;
}

/** A ciphertext ready to hand to a contract call. */
export interface ZamaCiphertext {
  /** bytes32 external ciphertext handle (0x-prefixed). */
  handle: string;
  /** ZK input proof bound to the contract + caller (0x-prefixed). */
  inputProof: string;
}

export type ZamaRelayerMode = 'uninitialized' | 'live';

function toHex(v: Uint8Array | string): string {
  if (typeof v === 'string') return v.startsWith('0x') ? v : `0x${v}`;
  let out = '0x';
  for (const b of v) out += b.toString(16).padStart(2, '0');
  return out;
}

export class ZamaRelayer {
  private static instance: ZamaRelayer;

  private fhevm: FhevmInstance | null = null;
  private initPromise: Promise<FhevmInstance> | null = null;

  private constructor() {}

  static getInstance(): ZamaRelayer {
    if (!ZamaRelayer.instance) {
      ZamaRelayer.instance = new ZamaRelayer();
    }
    return ZamaRelayer.instance;
  }

  /**
   * Lazily load the SDK + WASM and create the Sepolia-bound instance.
   * `provider` is an EIP-1193 provider (e.g. `window.ethereum`) used by
   * the SDK to read the FHEVM host-chain config. Idempotent.
   */
  public async init(provider: unknown): Promise<FhevmInstance> {
    if (this.fhevm) return this.fhevm;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      // Dynamic import keeps the WASM/worker bundle out of the main
      // chunk (and out of the Node/mobile builds entirely).
      const sdk = await import('@zama-fhe/relayer-sdk/web');
      await sdk.initSDK();
      // `network` accepts an EIP-1193 provider or RPC URL string; the
      // SDK's type is strict, so cast the untyped provider through.
      const config = { ...sdk.SepoliaConfig, network: provider as never };
      const inst = (await sdk.createInstance(config)) as unknown as FhevmInstance;
      this.fhevm = inst;
      return inst;
    })();

    try {
      return await this.initPromise;
    } catch (err) {
      // Reset so a later call can retry after the user fixes the
      // provider / network.
      this.initPromise = null;
      throw err;
    }
  }

  private ensureReady(): FhevmInstance {
    if (!this.fhevm) {
      throw new Error('ZamaRelayer not initialized — call init(provider) first.');
    }
    return this.fhevm;
  }

  /**
   * Encrypt a `uint32` value as an external ciphertext for
   * `contractAddress`, bound to `userAddress`. Returns the bytes32
   * handle + input proof to pass to `boostEncrypted` / `contestEncrypted`.
   */
  public async encrypt32(
    contractAddress: string,
    userAddress: string,
    value: number | bigint
  ): Promise<ZamaCiphertext> {
    const inst = this.ensureReady();
    const buffer = inst.createEncryptedInput(contractAddress, userAddress);
    buffer.add32(value);
    const enc = await buffer.encrypt();
    return {
      handle: toHex(enc.handles[0]),
      inputProof: toHex(enc.inputProof),
    };
  }

  /**
   * User-decrypt a ciphertext handle the connected wallet is
   * authorized to read (the contract must have granted access with
   * `FHE.allow(handle, user)`). Signs an EIP-712 permit with `signer`.
   */
  public async userDecrypt(
    handle: string,
    contractAddress: string,
    signer: Signer
  ): Promise<bigint> {
    const inst = this.ensureReady();
    const userAddress = await signer.getAddress();

    const keypair = inst.generateKeypair();
    const startTimeStamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = '10';
    const contractAddresses = [contractAddress];

    const eip712 = inst.createEIP712(
      keypair.publicKey,
      contractAddresses,
      startTimeStamp,
      durationDays
    );

    const signature = await (
      signer as unknown as {
        signTypedData: (d: unknown, t: unknown, m: unknown) => Promise<string>;
      }
    ).signTypedData(
      eip712.domain,
      { UserDecryptRequestVerification: (eip712.types as any).UserDecryptRequestVerification },
      eip712.message
    );

    const result = await inst.userDecrypt(
      [{ handle, contractAddress }],
      keypair.privateKey,
      keypair.publicKey,
      signature.replace(/^0x/, ''),
      contractAddresses,
      userAddress,
      startTimeStamp,
      durationDays
    );

    return BigInt(result[handle] as bigint | number | string);
  }

  /**
   * Public-decrypt a handle that the contract exposed via
   * `FHE.makePubliclyDecryptable` (e.g. the encrypted contest
   * win/loss outcome). Returns the boolean result.
   */
  public async publicDecryptBool(handle: string): Promise<boolean> {
    const inst = this.ensureReady();
    const result = await inst.publicDecrypt([handle]);
    return Boolean(result[handle]);
  }

  /** Read-only mode summary for the wallet UI badge / health checks. */
  public summary(): { mode: ZamaRelayerMode } {
    return { mode: this.fhevm ? 'live' : 'uninitialized' };
  }
}
