const { expect } = require('chai');
const { ethers, fhevm } = require('hardhat');
const { FhevmType } = require('@fhevm/hardhat-plugin');

/**
 * Zama Protocol FHEVM tests for `ConfidentialTerritoryDefense`.
 *
 * These run against the `@fhevm/hardhat-plugin` mock coprocessor,
 * which faithfully emulates the real Sepolia FHEVM ACL + encrypted
 * input + user/public decryption flow locally. The encrypted
 * `points` never appear in plaintext on-chain — every assertion
 * goes through `fhevm.createEncryptedInput(...)` to encrypt inputs
 * and `fhevm.userDecryptEuint(...)` / `fhevm.publicDecryptEbool(...)`
 * to read results (which requires the contract to have set the ACL
 * via `FHE.allow` / `FHE.makePubliclyDecryptable`).
 *
 * The same test suite runs unchanged against Sepolia
 * (`hardhat test --network sepolia`), where `fhevm.isMock` is false.
 */
const INITIAL = 500;
const MAX = 1000;
const DAY = 24 * 60 * 60;

describe('ConfidentialTerritoryDefense (Zama FHEVM)', () => {
  let defense;
  let addr;
  let deployer;
  let owner;
  let challenger;
  let nonOwner;

  before(async function () {
    // The mock coprocessor is required for the encrypt/decrypt
    // assertions. On a real network these helpers are unavailable.
    if (!fhevm.isMock) {
      console.warn('Skipping: this suite requires the FHEVM mock coprocessor');
      this.skip();
    }
  });

  beforeEach(async () => {
    [deployer, owner, challenger, nonOwner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('ConfidentialTerritoryDefense');
    defense = await Factory.deploy();
    await defense.waitForDeployment();
    addr = await defense.getAddress();
  });

  async function encAmount(user, value) {
    const input = await fhevm.createEncryptedInput(addr, user.address).add32(value).encrypt();
    return input;
  }

  async function decPoints(user, tokenId) {
    const meta = await defense.getDefenseMetadata(tokenId);
    return fhevm.userDecryptEuint(FhevmType.euint32, meta.points, addr, user);
  }

  describe('Deployment and anchoring', () => {
    it('deploys and reports un-anchored tokens as false', async () => {
      expect(addr).to.be.properAddress;
      expect(await defense.isAnchored(1)).to.equal(false);
    });

    it('anchors a territory with the encrypted initial points', async () => {
      await expect(defense.anchorFromZeta(1, owner.address)).to.emit(defense, 'TerritoryAnchored');
      const meta = await defense.getDefenseMetadata(1);
      expect(meta.anchored).to.equal(true);
      expect(meta.owner).to.equal(owner.address);
      expect(meta.tokenId).to.equal(1n);
      // Owner can user-decrypt the ciphertext to the initial value.
      expect(await decPoints(owner, 1)).to.equal(BigInt(INITIAL));
    });

    it('is a no-op on re-anchoring (sticky flag)', async () => {
      await defense.anchorFromZeta(1, owner.address);
      await defense.connect(deployer).anchorFromZeta(1, deployer.address);
      const meta = await defense.getDefenseMetadata(1);
      expect(meta.owner).to.equal(owner.address);
    });

    it('rejects a zero owner', async () => {
      await expect(defense.anchorFromZeta(1, ethers.ZeroAddress)).to.be.revertedWith(
        'ConfidentialTerritoryDefense: zero owner'
      );
    });
  });

  describe('Encrypted boost', () => {
    beforeEach(async () => {
      await defense.anchorFromZeta(1, owner.address);
    });

    it('boosts the defense by the encrypted amount', async () => {
      const enc = await encAmount(owner, 100);
      await expect(
        defense.connect(owner).boostEncrypted(1, enc.handles[0], enc.inputProof)
      ).to.emit(defense, 'EncryptedBoost');
      expect(await decPoints(owner, 1)).to.equal(BigInt(INITIAL + 100));
    });

    it('clamps the defense at ACTIVITY_MAX_POINTS under FHE', async () => {
      // 500 + 600 = 1100, clamped to 1000 (no revert — clamp is homomorphic).
      const enc = await encAmount(owner, 600);
      await defense.connect(owner).boostEncrypted(1, enc.handles[0], enc.inputProof);
      expect(await decPoints(owner, 1)).to.equal(BigInt(MAX));
    });

    it('rejects a non-owner caller', async () => {
      const enc = await encAmount(nonOwner, 100);
      await expect(
        defense.connect(nonOwner).boostEncrypted(1, enc.handles[0], enc.inputProof)
      ).to.be.revertedWithCustomError(defense, 'NotOwner');
    });

    it('rejects a second boost in the same UTC day', async () => {
      const enc1 = await encAmount(owner, 100);
      await defense.connect(owner).boostEncrypted(1, enc1.handles[0], enc1.inputProof);
      const enc2 = await encAmount(owner, 100);
      await expect(
        defense.connect(owner).boostEncrypted(1, enc2.handles[0], enc2.inputProof)
      ).to.be.revertedWithCustomError(defense, 'BoostAlreadyUsedToday');
    });

    it('rejects a boost before anchoring', async () => {
      const enc = await encAmount(owner, 100);
      await expect(
        defense.connect(owner).boostEncrypted(99, enc.handles[0], enc.inputProof)
      ).to.be.revertedWithCustomError(defense, 'NotAnchored');
    });
  });

  describe('Encrypted contest (score drain + encrypted comparison)', () => {
    beforeEach(async () => {
      await defense.anchorFromZeta(1, owner.address);
    });

    it('drains the defender score and records a publicly-decryptable outcome', async () => {
      const enc = await encAmount(challenger, 200);
      await expect(
        defense.connect(challenger).contestEncrypted(1, enc.handles[0], enc.inputProof)
      ).to.emit(defense, 'EncryptedContest');

      // Defender's remaining score (only owner can user-decrypt): 500 - 200 = 300.
      expect(await decPoints(owner, 1)).to.equal(300n);

      // Outcome is publicly decryptable: 200 > 500 is false (defender held).
      const outcome = await defense.lastContestOutcome(1);
      expect(await fhevm.publicDecryptEbool(outcome)).to.equal(false);
    });

    it('reveals a challenger win when the strike exceeds the score', async () => {
      const enc = await encAmount(challenger, 700);
      await defense.connect(challenger).contestEncrypted(1, enc.handles[0], enc.inputProof);
      // 700 > 500 -> challenger won; defender floored at 0.
      const outcome = await defense.lastContestOutcome(1);
      expect(await fhevm.publicDecryptEbool(outcome)).to.equal(true);
      expect(await decPoints(owner, 1)).to.equal(0n);
    });

    it('floors the defender at 0 (no underflow)', async () => {
      const enc = await encAmount(challenger, 1000);
      await defense.connect(challenger).contestEncrypted(1, enc.handles[0], enc.inputProof);
      expect(await decPoints(owner, 1)).to.equal(0n);
    });

    it('rejects a self-contest by the defender', async () => {
      const enc = await encAmount(owner, 100);
      await expect(
        defense.connect(owner).contestEncrypted(1, enc.handles[0], enc.inputProof)
      ).to.be.revertedWithCustomError(defense, 'SelfContest');
    });
  });

  describe('Read defense', () => {
    it('returns the ciphertext handle the owner can decrypt', async () => {
      await defense.anchorFromZeta(1, owner.address);
      const handle = await defense.myDefenseCipher(1);
      const clear = await fhevm.userDecryptEuint(FhevmType.euint32, handle, addr, owner);
      expect(clear).to.equal(BigInt(INITIAL));
    });

    it('reverts reads for un-anchored territories', async () => {
      await expect(defense.myDefenseCipher(99)).to.be.revertedWithCustomError(
        defense,
        'NotAnchored'
      );
    });
  });

  describe('Encrypted decay', () => {
    beforeEach(async () => {
      await defense.anchorFromZeta(1, owner.address);
    });

    it('is a no-op within the same UTC day', async () => {
      await defense.applyEncryptedDecay(1);
      expect(await decPoints(owner, 1)).to.equal(BigInt(INITIAL));
    });

    it('applies decay per elapsed day (floored at 0)', async () => {
      // Advance 2 UTC days: 500 - (2 * 10) = 480.
      await ethers.provider.send('evm_increaseTime', [2 * DAY]);
      await ethers.provider.send('evm_mine', []);
      await defense.applyEncryptedDecay(1);
      expect(await decPoints(owner, 1)).to.equal(480n);
    });

    it('reverts decay for un-anchored territories', async () => {
      await expect(defense.applyEncryptedDecay(99)).to.be.revertedWithCustomError(
        defense,
        'NotAnchored'
      );
    });
  });
});
