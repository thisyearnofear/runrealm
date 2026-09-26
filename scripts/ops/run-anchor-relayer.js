const hre = require('hardhat');

/**
 * Operator relayer: ZetaChain TerritoryCreated -> Sepolia CrossChainAnchor.
 *
 * Trial-phase operator process (self-contained hardhat script — no
 * workspace imports). Watches the Athens Universal contract and forwards
 * fresh territory claims through the anchor so shields activate without
 * manual anchoring. Long-running; restart on failure.
 *
 * Usage:
 *   RUNREALM_CROSS_CHAIN_ANCHOR_ADDRESS=0x... \
 *   npx hardhat run scripts/ops/run-anchor-relayer.js --network sepolia
 *
 * Deployer key comes from PRIVATE_KEY (must hold RELAYER_ROLE, i.e. the
 * anchor deployer by default). ZetaChain reads use the public Athens RPC.
 */

const UNIVERSAL_ADDRESS = '0x7A52d845Dc37aC5213a546a59A43148308A88983';
const ZETA_RPC = 'https://zetachain-athens-evm.blockpi.network/v1/rpc/public';
const POLL_MS = 15_000;
const LOOKBACK_BLOCKS = 2000n;

const UNIVERSAL_ABI = [
  'event TerritoryCreated(uint256 indexed tokenId, address indexed creator, string geohash, uint256 difficulty, uint256 distance, uint256 chainId)',
];
const ANCHOR_ABI = [
  'function anchor(uint256 tokenId, address owner, bytes32 zetaTxHash, uint256 logIndex) external',
  'function totalAnchored() external view returns (uint256)',
];

async function main() {
  const anchorAddress = process.env.RUNREALM_CROSS_CHAIN_ANCHOR_ADDRESS;
  if (!anchorAddress) throw new Error('Set RUNREALM_CROSS_CHAIN_ANCHOR_ADDRESS');

  const [relayer] = await hre.ethers.getSigners();
  console.log(`Relayer: ${relayer.address}`);

  const zetaProvider = new hre.ethers.JsonRpcProvider(ZETA_RPC);
  const universal = new hre.ethers.Contract(UNIVERSAL_ADDRESS, UNIVERSAL_ABI, zetaProvider);
  const anchor = new hre.ethers.Contract(anchorAddress, ANCHOR_ABI, relayer);

  console.log(`Anchored so far: ${await anchor.totalAnchored()}`);

  let fromBlock = (await zetaProvider.getBlockNumber()) - Number(LOOKBACK_BLOCKS);
  console.log(`Watching TerritoryCreated from block ${fromBlock}`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const toBlock = await zetaProvider.getBlockNumber();
      if (toBlock > fromBlock) {
        const logs = await universal.queryFilter(
          universal.filters.TerritoryCreated(),
          fromBlock,
          toBlock
        );
        for (const log of logs) {
          const { tokenId, creator } = log.args;
          console.log(
            `Forwarding token ${tokenId} (${creator}) @ ${log.transactionHash}:${log.index}`
          );
          const tx = await anchor.anchor(tokenId, creator, log.transactionHash, log.index);
          await tx.wait();
          console.log(`  anchored in ${tx.hash}`);
        }
        fromBlock = toBlock + 1;
      }
    } catch (error) {
      console.error('Poll failed, retrying:', error.message.slice(0, 160));
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
