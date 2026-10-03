const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const PRICE = ethers.parseEther('200');
const ESCROW = ethers.parseEther('1000');

describe('RunRealmEscrowV1 (marketplace + challenges)', () => {
  async function deployEscrowFixture() {
    const [owner, seller, buyer, brand] = await ethers.getSigners();
    const RealmToken = await ethers.getContractFactory('RealmToken');
    const realmToken = await RealmToken.deploy();
    await realmToken.waitForDeployment();
    await realmToken.addAuthorizedMinter(owner.address);
    await realmToken.mint(seller.address, ethers.parseEther('10000'));
    await realmToken.mint(buyer.address, ethers.parseEther('10000'));
    await realmToken.mint(brand.address, ethers.parseEther('100000'));
    const GameLogic = await ethers.getContractFactory('GameLogic');
    const gameLogic = await GameLogic.deploy();
    await gameLogic.waitForDeployment();
    const RunRealmUniversal = await ethers.getContractFactory('RunRealmUniversal', {
      libraries: { GameLogic: await gameLogic.getAddress() },
    });
    const universal = await RunRealmUniversal.deploy(await realmToken.getAddress());
    await universal.waitForDeployment();
    await realmToken.mint(await universal.getAddress(), ethers.parseEther('1000000'));
    const RunRealmEscrowV1 = await ethers.getContractFactory('RunRealmEscrowV1');
    const escrow = await RunRealmEscrowV1.deploy(
      await realmToken.getAddress(),
      await universal.getAddress(),
      owner.address
    );
    await escrow.waitForDeployment();
    await universal.connect(seller).mintTerritory('u4pruydqqvj', 75, 2500, ['Central Park']);
    return { realmToken, universal, escrow, owner, seller, buyer, brand };
  }

  it('lists only for the owner, buys with a 2.5% treasury fee', async () => {
    const { realmToken, escrow, seller, buyer, owner } = await loadFixture(deployEscrowFixture);
    const escrowAddr = await escrow.getAddress();
    await expect(escrow.connect(buyer).listTerritory(1, PRICE)).to.be.revertedWithCustomError(escrow, 'NotOwner');
    await expect(escrow.connect(seller).listTerritory(1, PRICE)).to.emit(escrow, 'TerritoryListed');
    await realmToken.connect(buyer).approve(escrowAddr, ethers.parseEther('10000'));
    const fee = (PRICE * 250n) / 10000n;
    const sellerBefore = await realmToken.balanceOf(seller.address);
    const treasuryBefore = await realmToken.balanceOf(owner.address);
    await expect(escrow.connect(buyer).buyTerritory(1))
      .to.emit(escrow, 'TerritorySold')
      .withArgs(1, seller.address, buyer.address, PRICE, fee);
    expect(await realmToken.balanceOf(seller.address)).to.equal(sellerBefore + PRICE);
    expect(await realmToken.balanceOf(owner.address)).to.equal(treasuryBefore + fee);
  });

  it('delists only for the seller', async () => {
    const { escrow, seller, buyer } = await loadFixture(deployEscrowFixture);
    await escrow.connect(seller).listTerritory(1, PRICE);
    await expect(escrow.connect(buyer).delistTerritory(1)).to.be.revertedWithCustomError(escrow, 'NotSeller');
    await expect(escrow.connect(seller).delistTerritory(1)).to.emit(escrow, 'TerritoryDelisted');
  });

  it('creates challenges with escrow + 500 REALM fee', async () => {
    const { realmToken, escrow, brand, owner } = await loadFixture(deployEscrowFixture);
    const escrowAddr = await escrow.getAddress();
    await realmToken.connect(brand).approve(escrowAddr, ethers.parseEther('100000'));
    await expect(escrow.connect(brand).createChallenge(ethers.parseEther('10'))).to.be.revertedWithCustomError(escrow, 'InsufficientEscrow');
    const treasuryBefore = await realmToken.balanceOf(owner.address);
    await expect(escrow.connect(brand).createChallenge(ESCROW))
      .to.emit(escrow, 'ChallengeCreated')
      .withArgs(1, brand.address, ESCROW, ethers.parseEther('500'));
    expect(await realmToken.balanceOf(owner.address)).to.equal(treasuryBefore + ethers.parseEther('500'));
    expect(await realmToken.balanceOf(escrowAddr)).to.equal(ESCROW);
  });
});
