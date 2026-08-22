const { expect } = require('chai');
const { ethers, fhevm } = require('hardhat');

/**
 * Phase 6 — CrossChainAnchor tests.
 *
 * The anchor is the bridge between ZetaChain territory ownership and
 * the Zama encrypted defense layer. These tests exercise the
 * relayer-gating, log-replay protection, and the forwarding into
 * `ConfidentialTerritoryDefense.anchorFromZeta` (using the FHEVM mock
 * coprocessor for the encrypted side, same as the defense suite).
 */
const ZETA_CHAIN_ID = 7001;

describe('CrossChainAnchor', () => {
  let defense;
  let anchor;
  let deployer;
  let relayer;
  let owner;
  let attacker;

  before(async function () {
    if (!fhevm.isMock) {
      console.warn('Skipping: this suite requires the FHEVM mock coprocessor');
      this.skip();
    }
  });

  beforeEach(async () => {
    [deployer, relayer, owner, attacker] = await ethers.getSigners();

    const Defense = await ethers.getContractFactory('ConfidentialTerritoryDefense');
    defense = await Defense.deploy();
    await defense.waitForDeployment();

    const Anchor = await ethers.getContractFactory('CrossChainAnchor');
    anchor = await Anchor.deploy(
      await defense.getAddress(),
      ZETA_CHAIN_ID,
      deployer.address,
      relayer.address
    );
    await anchor.waitForDeployment();
  });

  describe('Deployment', () => {
    it('wires the defense contract, chain id, and roles', async () => {
      expect(await anchor.defense()).to.equal(await defense.getAddress());
      expect(await anchor.zetaChainId()).to.equal(ZETA_CHAIN_ID);

      const RELAYER_ROLE = await anchor.RELAYER_ROLE();
      const DEFAULT_ADMIN_ROLE = await anchor.DEFAULT_ADMIN_ROLE();
      expect(await anchor.hasRole(RELAYER_ROLE, relayer.address)).to.equal(true);
      expect(await anchor.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.equal(true);
    });

    it('reverts on zero defense / admin / relayer', async () => {
      const Anchor = await ethers.getContractFactory('CrossChainAnchor');
      await expect(
        Anchor.deploy(ethers.ZeroAddress, ZETA_CHAIN_ID, deployer.address, relayer.address)
      ).to.be.revertedWith('CrossChainAnchor: zero defense');
      await expect(
        Anchor.deploy(
          await defense.getAddress(),
          ZETA_CHAIN_ID,
          ethers.ZeroAddress,
          relayer.address
        )
      ).to.be.revertedWith('CrossChainAnchor: zero admin');
      await expect(
        Anchor.deploy(
          await defense.getAddress(),
          ZETA_CHAIN_ID,
          deployer.address,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith('CrossChainAnchor: zero relayer');
    });
  });

  describe('Anchoring', () => {
    const tokenId = 1n;
    const zetaTxHash = ethers.id('zeta-claim-tx-1');
    const logIndex = 0n;

    it('relayer can anchor a ZetaChain territory into the defense layer', async () => {
      const tx = anchor.connect(relayer).anchor(tokenId, owner.address, zetaTxHash, logIndex);

      await expect(tx)
        .to.emit(anchor, 'TerritoryObserved')
        .withArgs(
          tokenId,
          owner.address,
          ethers.solidityPackedKeccak256(['bytes32', 'uint256'], [zetaTxHash, logIndex]),
          ZETA_CHAIN_ID,
          zetaTxHash,
          logIndex
        );
      await expect(tx).to.emit(defense, 'TerritoryAnchored');

      expect(await anchor.isAnchored(tokenId)).to.equal(true);
      expect(await anchor.anchoredTokens(tokenId)).to.equal(true);
      expect(await anchor.totalAnchored()).to.equal(1n);
    });

    it('rejects non-relayer callers', async () => {
      await expect(
        anchor.connect(attacker).anchor(tokenId, owner.address, zetaTxHash, logIndex)
      ).to.be.revertedWithCustomError(anchor, 'AccessControlUnauthorizedAccount');
    });

    it('rejects replaying the same ZetaChain log identity', async () => {
      await anchor.connect(relayer).anchor(tokenId, owner.address, zetaTxHash, logIndex);

      await expect(
        anchor.connect(relayer).anchor(tokenId, owner.address, zetaTxHash, logIndex)
      ).to.be.revertedWithCustomError(anchor, 'AlreadyObserved');
    });

    it('allows the same tokenId from a DIFFERENT log (defense no-ops, sticky)', async () => {
      await anchor.connect(relayer).anchor(tokenId, owner.address, zetaTxHash, logIndex);

      const otherTxHash = ethers.id('zeta-claim-tx-2');
      // A different log for the same tokenId — the defense contract's
      // sticky anchored flag makes this a no-op, and the anchor keeps
      // its original owner.
      await anchor.connect(relayer).anchor(tokenId, attacker.address, otherTxHash, 1n);

      const meta = await defense.getDefenseMetadata(tokenId);
      expect(meta.owner).to.equal(owner.address);
      expect(await anchor.totalAnchored()).to.equal(1n);
    });

    it('rejects zero tokenId and zero owner', async () => {
      await expect(
        anchor.connect(relayer).anchor(0n, owner.address, zetaTxHash, logIndex)
      ).to.be.revertedWithCustomError(anchor, 'ZeroTokenId');
      await expect(
        anchor.connect(relayer).anchor(tokenId, ethers.ZeroAddress, zetaTxHash, logIndex)
      ).to.be.revertedWithCustomError(anchor, 'ZeroOwner');
    });

    it('anchors a batch of territories', async () => {
      const tokenIds = [10n, 11n, 12n];
      const owners = [owner.address, attacker.address, owner.address];
      const hashes = [ethers.id('t10'), ethers.id('t11'), ethers.id('t12')];
      const indexes = [0n, 0n, 2n];

      await anchor.connect(relayer).anchorBatch(tokenIds, owners, hashes, indexes);

      expect(await anchor.totalAnchored()).to.equal(3n);
      expect(await defense.isAnchored(10n)).to.equal(true);
      expect(await defense.isAnchored(11n)).to.equal(true);
      expect(await defense.isAnchored(12n)).to.equal(true);
    });

    it('rejects batch with length mismatch', async () => {
      await expect(
        anchor
          .connect(relayer)
          .anchorBatch([1n, 2n], [owner.address], [zetaTxHash, zetaTxHash], [0n, 0n])
      ).to.be.revertedWith('CrossChainAnchor: length mismatch');
    });
  });

  describe('Relayer management', () => {
    it('admin can rotate relayer keys', async () => {
      await anchor.connect(deployer).setRelayer(attacker.address, true);

      const RELAYER_ROLE = await anchor.RELAYER_ROLE();
      expect(await anchor.hasRole(RELAYER_ROLE, attacker.address)).to.equal(true);

      // New relayer works
      await anchor.connect(attacker).anchor(5n, owner.address, ethers.id('rotated'), 0n);
      expect(await anchor.anchoredTokens(5n)).to.equal(true);

      // Old relayer revoked
      await anchor.connect(deployer).setRelayer(relayer.address, false);
      expect(await anchor.hasRole(RELAYER_ROLE, relayer.address)).to.equal(false);
    });

    it('non-admin cannot manage relayers', async () => {
      await expect(
        anchor.connect(attacker).setRelayer(attacker.address, true)
      ).to.be.revertedWithCustomError(anchor, 'AccessControlUnauthorizedAccount');
    });
  });
});
