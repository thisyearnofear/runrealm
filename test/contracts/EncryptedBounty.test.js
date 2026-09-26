const { expect } = require('chai');
const { ethers, fhevm } = require('hardhat');
const { FhevmType } = require('@fhevm/hardhat-plugin');

/**
 * H3 Phase C tests: encrypted bounty escrow on `ConfidentialTerritoryDefense`.
 *
 * Runs against the `@fhevm/hardhat-plugin` mock coprocessor. The bounty
 * amount never appears in plaintext: staking posts a ciphertext, a
 * contest win seals it homomorphically into the winner's credit, and
 * every assertion decrypts through `userDecryptEuint` (owner/winner
 * ACL) exactly like the defense-score suite.
 */

describe('ConfidentialTerritoryDefense — encrypted bounty (Phase C)', () => {
  let defense;
  let addr;
  let deployer;
  let owner;
  let challenger;

  before(async function () {
    if (!fhevm.isMock) {
      console.warn('Skipping: this suite requires the FHEVM mock coprocessor');
      this.skip();
    }
  });

  beforeEach(async () => {
    [deployer, owner, challenger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('ConfidentialTerritoryDefense');
    defense = await Factory.deploy();
    await defense.waitForDeployment();
    addr = await defense.getAddress();
    await defense.anchorFromZeta(1, owner.address);
  });

  async function encAmount(user, value) {
    const input = await fhevm.createEncryptedInput(addr, user.address).add32(value).encrypt();
    return input;
  }

  async function decBounty(user, tokenId) {
    const cipher = await defense.bountyCipher(tokenId);
    return fhevm.userDecryptEuint(FhevmType.euint32, cipher, addr, user);
  }

  async function decCredit(user, tokenId) {
    const [cipher] = await defense.bountyCreditOf(tokenId);
    return fhevm.userDecryptEuint(FhevmType.euint32, cipher, addr, user);
  }

  it('stakes an encrypted bounty readable only by the owner', async () => {
    const enc = await encAmount(owner, 250);
    // NOTE: no handle comparison in withArgs — an awaited view there
    // races the pending tx and reads pre-stake state. Values are
    // asserted post-mining below via user-decrypt.
    await expect(
      defense.connect(owner).stakeBountyEncrypted(1, enc.handles[0], enc.inputProof)
    ).to.emit(defense, 'BountyStakedEncrypted');
    expect(await decBounty(owner, 1)).to.equal(250n);
  });

  it('rejects stakes on unanchored tokens and by non-owners', async () => {
    const encOwner = await encAmount(owner, 100);
    await expect(
      defense.connect(owner).stakeBountyEncrypted(99, encOwner.handles[0], encOwner.inputProof)
    ).to.be.revertedWithCustomError(defense, 'NotAnchored');
    const encChallenger = await encAmount(challenger, 100);
    await expect(
      defense
        .connect(challenger)
        .stakeBountyEncrypted(1, encChallenger.handles[0], encChallenger.inputProof)
    ).to.be.revertedWithCustomError(defense, 'NotOwner');
  });

  it('seals the full bounty to the winner credit on a contest win', async () => {
    const encStake = await encAmount(owner, 250);
    await defense.connect(owner).stakeBountyEncrypted(1, encStake.handles[0], encStake.inputProof);

    // Strike 700 > defense 500: challenger wins, seals 250 to credit.
    const encStrike = await encAmount(challenger, 700);
    await expect(
      defense.connect(challenger).contestEncrypted(1, encStrike.handles[0], encStrike.inputProof)
    ).to.emit(defense, 'EncryptedBountySealed');
    const [creditCipher, winner] = await defense.bountyCreditOf(1);
    expect(winner).to.equal(challenger.address);

    expect(await decCredit(challenger, 1)).to.equal(250n);
    // Bounty slot cleared after sealing.
    expect(await decBounty(owner, 1)).to.equal(0n);
  });

  it('seals zero credit on a contest loss', async () => {
    const encStake = await encAmount(owner, 250);
    await defense.connect(owner).stakeBountyEncrypted(1, encStake.handles[0], encStake.inputProof);

    // Strike 200 < defense 500: defender holds, credit is 0.
    const encStrike = await encAmount(challenger, 200);
    await defense
      .connect(challenger)
      .contestEncrypted(1, encStrike.handles[0], encStrike.inputProof);
    expect(await decCredit(challenger, 1)).to.equal(0n);
  });

  it('contests without a bounty behave exactly as before', async () => {
    const encStrike = await encAmount(challenger, 700);
    await expect(
      defense.connect(challenger).contestEncrypted(1, encStrike.handles[0], encStrike.inputProof)
    ).to.emit(defense, 'EncryptedContest');
    await expect(
      defense.connect(challenger).contestEncrypted(1, encStrike.handles[0], encStrike.inputProof)
    ).to.not.emit(defense, 'EncryptedBountySealed');
  });
});
