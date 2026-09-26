const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

/**
 * H3 Phase B tests for `RunRealmBountyV1` (ZetaChain-side escrow).
 *
 * Follows the additive-contract precedent: the frozen `RunRealmUniversal`
 * is deployed for real and its ERC-721 `ownerOf` is the trustless
 * claimant check — no mocks, no oracles. REALM is the real `RealmToken`
 * (deployer mints test balances via the authorized-minter path, exactly
 * like the Universal suite fixture).
 */

const STAKE = ethers.parseEther('100'); // 100 REALM (within 25–1000)

describe('RunRealmBountyV1 (Phase B escrow)', () => {
  async function deployBountyFixture() {
    const [owner, defender, challenger] = await ethers.getSigners();

    const RealmToken = await ethers.getContractFactory('RealmToken');
    const realmToken = await RealmToken.deploy();
    await realmToken.waitForDeployment();
    await realmToken.addAuthorizedMinter(owner.address);
    await realmToken.mint(defender.address, ethers.parseEther('10000'));
    await realmToken.mint(challenger.address, ethers.parseEther('10000'));

    const GameLogic = await ethers.getContractFactory('GameLogic');
    const gameLogic = await GameLogic.deploy();
    await gameLogic.waitForDeployment();

    const RunRealmUniversal = await ethers.getContractFactory('RunRealmUniversal', {
      libraries: { GameLogic: await gameLogic.getAddress() },
    });
    const universal = await RunRealmUniversal.deploy(await realmToken.getAddress());
    await universal.waitForDeployment();

    // Reward distribution pays from the universal contract's REALM
    // balance — fund it like the Universal suite fixture does.
    await realmToken.mint(await universal.getAddress(), ethers.parseEther('1000000'));

    const RunRealmBountyV1 = await ethers.getContractFactory('RunRealmBountyV1');
    const bounty = await RunRealmBountyV1.deploy(
      await realmToken.getAddress(),
      await universal.getAddress()
    );
    await bounty.waitForDeployment();

    // Defender mints territory #1 and funds the escrow approval.
    await universal.connect(defender).mintTerritory('u4pruydqqvj', 75, 2500, ['Central Park']);
    await realmToken
      .connect(defender)
      .approve(await bounty.getAddress(), ethers.parseEther('10000'));

    return { realmToken, universal, bounty, owner, defender, challenger };
  }

  it('stakes within bounds and emits BountyStaked', async () => {
    const { bounty, defender } = await loadFixture(deployBountyFixture);
    await expect(bounty.connect(defender).stakeBounty(1, STAKE))
      .to.emit(bounty, 'BountyStaked')
      .withArgs(1, defender.address, STAKE);
    const record = await bounty.bounties(1);
    expect(record.staker).to.equal(defender.address);
    expect(record.amount).to.equal(STAKE);
  });

  it('rejects out-of-range stakes and non-owner stakes', async () => {
    const { bounty, defender, challenger } = await loadFixture(deployBountyFixture);
    await expect(
      bounty.connect(defender).stakeBounty(1, ethers.parseEther('10'))
    ).to.be.revertedWithCustomError(bounty, 'StakeOutOfRange');
    await expect(
      bounty.connect(defender).stakeBounty(1, ethers.parseEther('5000'))
    ).to.be.revertedWithCustomError(bounty, 'StakeOutOfRange');
    await expect(bounty.connect(challenger).stakeBounty(1, STAKE)).to.be.revertedWithCustomError(
      bounty,
      'NotStaker'
    );
  });

  it('restaking replaces (refunds old, takes new)', async () => {
    const { realmToken, bounty, defender } = await loadFixture(deployBountyFixture);
    const bountyAddr = await bounty.getAddress();
    await bounty.connect(defender).stakeBounty(1, STAKE);
    const before = await realmToken.balanceOf(defender.address);
    await bounty.connect(defender).stakeBounty(1, ethers.parseEther('200'));
    const after = await realmToken.balanceOf(defender.address);
    // Net effect: only the extra 100 left the defender's wallet.
    expect(before - after).to.equal(ethers.parseEther('100'));
    expect((await bounty.bounties(1)).amount).to.equal(ethers.parseEther('200'));
  });

  it('withdraw respects the delay then refunds', async () => {
    const { bounty, defender } = await loadFixture(deployBountyFixture);
    await bounty.connect(defender).stakeBounty(1, STAKE);
    await expect(bounty.connect(defender).withdrawBounty(1)).to.be.revertedWithCustomError(
      bounty,
      'WithdrawLocked'
    );
    await time.increase(49 * 60 * 60); // past the 48h delay
    await expect(bounty.connect(defender).withdrawBounty(1))
      .to.emit(bounty, 'BountyWithdrawn')
      .withArgs(1, defender.address, STAKE);
    expect((await bounty.bounties(1)).amount).to.equal(0);
  });

  it('claim pays the new owner 80/20 and starts cooldown', async () => {
    const { realmToken, universal, bounty, defender, challenger } =
      await loadFixture(deployBountyFixture);
    const bountyAddr = await bounty.getAddress();
    const dead = '0x000000000000000000000000000000000000dEaD';
    await bounty.connect(defender).stakeBounty(1, STAKE);

    // Steal simulation: NFT moves defender -> challenger on the registry.
    await universal.connect(defender).transferFrom(defender.address, challenger.address, 1);

    const challengerBefore = await realmToken.balanceOf(challenger.address);
    const deadBefore = await realmToken.balanceOf(dead);
    await expect(bounty.connect(challenger).claimBounty(1))
      .to.emit(bounty, 'BountyClaimed')
      .withArgs(1, challenger.address, ethers.parseEther('80'), ethers.parseEther('20'));
    expect(await realmToken.balanceOf(challenger.address)).to.equal(
      challengerBefore + ethers.parseEther('80')
    );
    expect(await realmToken.balanceOf(dead)).to.equal(deadBefore + ethers.parseEther('20'));
    expect(await bounty.lastSettledAt(1)).to.be.gt(0);

    // Cooldown: immediate restake reverts.
    await realmToken.connect(challenger).approve(bountyAddr, ethers.parseEther('10000'));
    await expect(bounty.connect(challenger).stakeBounty(1, STAKE)).to.be.revertedWithCustomError(
      bounty,
      'BountyCooldown'
    );
  });

  it('staker cannot claim their own bounty', async () => {
    const { bounty, defender } = await loadFixture(deployBountyFixture);
    await bounty.connect(defender).stakeBounty(1, STAKE);
    await expect(bounty.connect(defender).claimBounty(1)).to.be.revertedWithCustomError(
      bounty,
      'NotNewOwner'
    );
  });

  it('reclaim shield blocks the previous staker after cooldown', async () => {
    const { realmToken, universal, bounty, defender, challenger } =
      await loadFixture(deployBountyFixture);
    const bountyAddr = await bounty.getAddress();
    await bounty.connect(defender).stakeBounty(1, STAKE);
    await universal.connect(defender).transferFrom(defender.address, challenger.address, 1);
    await bounty.connect(challenger).claimBounty(1);

    // Token returns to the previous staker; past the 24h cooldown but
    // inside the 7-day reclaim shield — restake must revert.
    await universal.connect(challenger).transferFrom(challenger.address, defender.address, 1);
    await time.increase(25 * 60 * 60);
    await realmToken.connect(defender).approve(bountyAddr, ethers.parseEther('10000'));
    await expect(bounty.connect(defender).stakeBounty(1, STAKE)).to.be.revertedWithCustomError(
      bounty,
      'ReclaimBlocked'
    );
    // After the shield expires, the same staker may stake again.
    await time.increase(7 * 24 * 60 * 60);
    await expect(bounty.connect(defender).stakeBounty(1, STAKE)).to.emit(bounty, 'BountyStaked');
  });
});
