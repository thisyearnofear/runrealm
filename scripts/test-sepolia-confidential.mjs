/**
 * Test the confidential shield flow on Sepolia.
 *
 * 1. Anchor a test tokenId to the deployer wallet.
 * 2. Encrypt a uint32 boost amount using the Zama Node SDK.
 * 3. Call boostEncrypted on the deployed ConfidentialTerritoryDefense contract.
 * 4. Read back the encrypted defense handle and optionally user-decrypt it.
 */
import 'dotenv/config';
import { Contract, formatEther, hexlify, JsonRpcProvider, Wallet } from 'ethers';

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.RUNREALM_CONFIDENTIAL_DEFENSE_ADDRESS;
const TEST_TOKEN_ID = 9999;

if (!SEPOLIA_RPC_URL || !PRIVATE_KEY || !CONTRACT_ADDRESS) {
  throw new Error('Missing SEPOLIA_RPC_URL, PRIVATE_KEY or RUNREALM_CONFIDENTIAL_DEFENSE_ADDRESS');
}

const provider = new JsonRpcProvider(SEPOLIA_RPC_URL);
const signer = new Wallet(PRIVATE_KEY, provider);
const userAddress = await signer.getAddress();

console.log('User:', userAddress);
console.log('Balance:', formatEther(await provider.getBalance(userAddress)), 'ETH');

const contractAbi = [
  'function anchorFromZeta(uint256 tokenId, address owner) external',
  'function boostEncrypted(uint256 tokenId, bytes32 encryptedAmount, bytes calldata inputProof) external',
  'function contestEncrypted(uint256 tokenId, bytes32 encryptedAmount, bytes calldata inputProof) external',
  'function myDefenseCipher(uint256 tokenId) view returns (bytes32)',
  'function getDefenseMetadata(uint256 tokenId) view returns (address owner, uint256 tokenIdOut, bytes32 pointsCipher, uint256 lastDecayDay, bool anchored)',
  'event TerritoryAnchored(uint256 indexed tokenId, address indexed owner, bytes32 initialHandle)',
  'event DefenseBoosted(uint256 indexed tokenId, address indexed booster, bytes32 amountHandle)',
];
const contract = new Contract(CONTRACT_ADDRESS, contractAbi, signer);

// Load Zama Relayer SDK (Node build)
const sdk = await import('@zama-fhe/relayer-sdk/node');
const inst = await sdk.createInstance({ ...sdk.SepoliaConfig, network: SEPOLIA_RPC_URL });

const meta = await contract.getDefenseMetadata(TEST_TOKEN_ID);
if (!meta.anchored) {
  console.log(`Anchoring token ${TEST_TOKEN_ID}...`);
  const tx = await contract.anchorFromZeta(TEST_TOKEN_ID, userAddress);
  await tx.wait();
  console.log('Anchored:', tx.hash);
} else {
  console.log(`Token ${TEST_TOKEN_ID} already anchored`);
}

const boostAmount = 42;
console.log(`Encrypting boost amount ${boostAmount}...`);
const input = inst.createEncryptedInput(CONTRACT_ADDRESS, userAddress);
input.add32(boostAmount);
const encrypted = await input.encrypt();
const handle = hexlify(encrypted.handles[0]);
const proof = hexlify(encrypted.inputProof);
console.log('Handle:', handle);
console.log('Proof length:', (proof.length - 2) / 2, 'bytes');

console.log('Sending boostEncrypted transaction...');
const boostTx = await contract.boostEncrypted(TEST_TOKEN_ID, handle, proof);
const receipt = await boostTx.wait();
console.log('Boosted:', receipt.hash);

const defenseHandle = await contract.myDefenseCipher(TEST_TOKEN_ID);
console.log('Defense handle:', defenseHandle);
