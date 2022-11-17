import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { contract, ethers } from 'hardhat';

import {
  Mock1Inch,
  Mock1Inch__factory,
  MockAgToken,
  MockAgToken__factory,
  MockAngleRouterMainnet,
  MockAngleRouterMainnet__factory,
  MockCoreBorrow,
  MockCoreBorrow__factory,
  MockLiquidityGauge,
  MockLiquidityGauge__factory,
  MockPerpetualManager,
  MockPerpetualManager__factory,
  MockStableMaster,
  MockStableMaster__factory,
  MockTokenPermit,
  MockTokenPermit__factory,
  MockUniswapV3Router,
  MockUniswapV3Router__factory,
  MockVeANGLE,
  MockVeANGLE__factory,
} from '../../../../../typechain';
import { expect } from '../../../../../utils/chai-setup';
import { deployUpgradeable, MAX_UINT256, ZERO_ADDRESS } from '../../../utils/helpers';

contract('AngleRouterMainnet - Governance', () => {
  let deployer: SignerWithAddress;
  let USDC: MockTokenPermit;
  let ANGLE: MockTokenPermit;
  let agEUR: MockAgToken;
  let veANGLE: MockVeANGLE;
  let core: MockCoreBorrow;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let uniswap: MockUniswapV3Router;
  let oneInch: Mock1Inch;
  let router: MockAngleRouterMainnet;
  let gauge: MockLiquidityGauge;
  let stableMaster: MockStableMaster;
  let perpetual: MockPerpetualManager;
  let sanToken: MockTokenPermit;

  before(async () => {
    ({ deployer, alice, bob } = await ethers.getNamedSigners());
  });

  beforeEach(async () => {
    // If the forked-network state needs to be reset between each test, run this
    router = (await deployUpgradeable(new MockAngleRouterMainnet__factory(deployer))) as MockAngleRouterMainnet;
    USDC = (await new MockTokenPermit__factory(deployer).deploy('USDC', 'USDC', 6)) as MockTokenPermit;
    ANGLE = (await new MockTokenPermit__factory(deployer).deploy('ANGLE', 'ANGLE', 18)) as MockTokenPermit;
    agEUR = (await deployUpgradeable(new MockAgToken__factory(deployer))) as MockAgToken;
    veANGLE = (await new MockVeANGLE__factory(deployer).deploy()) as MockVeANGLE;
    veANGLE.setAngle(ANGLE.address);
    await agEUR.initialize('agEUR', 'agEUR', ZERO_ADDRESS, ZERO_ADDRESS);
    uniswap = (await new MockUniswapV3Router__factory(deployer).deploy(
      USDC.address,
      agEUR.address,
    )) as MockUniswapV3Router;
    oneInch = (await new Mock1Inch__factory(deployer).deploy(USDC.address, agEUR.address)) as Mock1Inch;
    core = (await new MockCoreBorrow__factory(deployer).deploy()) as MockCoreBorrow;
    await core.toggleGovernor(alice.address);
    await core.toggleGuardian(alice.address);
    await router.setAngleAndVeANGLE(veANGLE.address);
    await router.initialize(core.address, uniswap.address, oneInch.address, ANGLE.address, [], [], [], []);
    sanToken = (await new MockTokenPermit__factory(deployer).deploy('sanUSDC', 'sanUSDC', 6)) as MockTokenPermit;
    gauge = (await new MockLiquidityGauge__factory(deployer).deploy(sanToken.address)) as MockLiquidityGauge;
    stableMaster = (await new MockStableMaster__factory(deployer).deploy(agEUR.address)) as MockStableMaster;
    perpetual = (await new MockPerpetualManager__factory(deployer).deploy()) as MockPerpetualManager;
  });
  describe('initialize', () => {
    it('success - correctly initialized', async () => {
      expect(await router.core()).to.be.equal(core.address);
      expect(await router.uniswapV3Router()).to.be.equal(uniswap.address);
      expect(await router.oneInch()).to.be.equal(oneInch.address);
      expect(await router.mapStableMasters('0x1a7e4e63778B4f12a199C062f3eFdD288afCBce8')).to.be.equal(
        '0x5adDc89785D75C86aB939E9e15bfBBb7Fc086A87',
      );
      expect(await ANGLE.allowance(router.address, veANGLE.address)).to.be.equal(MAX_UINT256);
      await expect(router.initializeRouter(core.address, uniswap.address, oneInch.address)).to.be.revertedWith(
        'Initializable: contract is already initialized',
      );
      await expect(
        router.initialize(core.address, uniswap.address, oneInch.address, ANGLE.address, [], [], [], []),
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });
  });
  describe('addStableMaster', () => {
    it('reverts - not governor or guardian', async () => {
      await expect(router.connect(deployer).addStableMaster(agEUR.address, stableMaster.address)).to.be.revertedWith(
        'NotGovernorOrGuardian',
      );
    });
    it('reverts - invalid params', async () => {
      await expect(router.connect(alice).addStableMaster(ZERO_ADDRESS, stableMaster.address)).to.be.revertedWith(
        'InvalidParams',
      );
      const stableMasterRevert = (await new MockStableMaster__factory(deployer).deploy(
        bob.address,
      )) as MockStableMaster;
      await expect(router.connect(alice).addStableMaster(agEUR.address, stableMasterRevert.address)).to.be.revertedWith(
        'InvalidParams',
      );
      await expect(
        router.connect(alice).addStableMaster('0x1a7e4e63778B4f12a199C062f3eFdD288afCBce8', stableMasterRevert.address),
      ).to.be.revertedWith('InvalidParams');
    });
    it('success - stableMaster added', async () => {
      await router.connect(alice).addStableMaster(agEUR.address, stableMaster.address);
      expect(await router.mapStableMasters(agEUR.address)).to.be.equal(stableMaster.address);
    });
  });
  describe('addPairs', () => {
    it('reverts - not governor or guardian', async () => {
      await expect(router.connect(deployer).addPairs([], [], [], [])).to.be.revertedWith('NotGovernorOrGuardian');
    });
    it('reverts - incompatible lengths', async () => {
      await expect(
        router.connect(alice).addPairs([bob.address], [alice.address], [deployer.address], [true, false]),
      ).to.be.revertedWith('IncompatibleLengths');
      await expect(
        router
          .connect(alice)
          .addPairs([bob.address, alice.address], [alice.address, alice.address], [deployer.address], [true, false]),
      ).to.be.revertedWith('IncompatibleLengths');
      await expect(
        router
          .connect(alice)
          .addPairs([bob.address], [alice.address, alice.address], [deployer.address, alice.address], [true, false]),
      ).to.be.revertedWith('IncompatibleLengths');
      await expect(
        router
          .connect(alice)
          .addPairs([bob.address, alice.address], [alice.address], [deployer.address, alice.address], [true, false]),
      ).to.be.revertedWith('IncompatibleLengths');
    });
    it('reverts - when stableMaster has not been added yet', async () => {
      await expect(router.connect(alice).addPairs([agEUR.address], [alice.address], [deployer.address], [true])).to.be
        .reverted;
    });
    it('success - pair successfully added - with liquidity gauge', async () => {
      await router.connect(alice).addStableMaster(agEUR.address, stableMaster.address);
      await stableMaster.addCollateral(alice.address, USDC.address, sanToken.address, perpetual.address);
      // using alice as a poolManager
      await router.connect(alice).addPairs([agEUR.address], [alice.address], [gauge.address], [false]);
      expect(await USDC.allowance(router.address, stableMaster.address)).to.be.equal(MAX_UINT256);
      expect(await USDC.allowance(router.address, perpetual.address)).to.be.equal(MAX_UINT256);
      expect(await sanToken.allowance(router.address, gauge.address)).to.be.equal(MAX_UINT256);
      const pair = await router.mapPoolManagers(stableMaster.address, USDC.address);
      expect(pair.poolManager).to.be.equal(alice.address);
      expect(pair.sanToken).to.be.equal(sanToken.address);
      expect(pair.perpetualManager).to.be.equal(perpetual.address);
      expect(pair.gauge).to.be.equal(gauge.address);
    });
    it('success - pair successfully added - without liquidity gauge', async () => {
      await router.connect(alice).addStableMaster(agEUR.address, stableMaster.address);
      await stableMaster.addCollateral(alice.address, USDC.address, sanToken.address, perpetual.address);
      // using alice as a poolManager
      await router.connect(alice).addPairs([agEUR.address], [alice.address], [ZERO_ADDRESS], [false]);
      expect(await USDC.allowance(router.address, stableMaster.address)).to.be.equal(MAX_UINT256);
      expect(await USDC.allowance(router.address, perpetual.address)).to.be.equal(MAX_UINT256);
      expect(await sanToken.allowance(router.address, gauge.address)).to.be.equal(0);
      const pair = await router.mapPoolManagers(stableMaster.address, USDC.address);
      expect(pair.poolManager).to.be.equal(alice.address);
      expect(pair.sanToken).to.be.equal(sanToken.address);
      expect(pair.perpetualManager).to.be.equal(perpetual.address);
      expect(pair.gauge).to.be.equal(ZERO_ADDRESS);
    });
    it('reverts - when invalid liquidity gauge', async () => {
      await router.connect(alice).addStableMaster(agEUR.address, stableMaster.address);
      await stableMaster.addCollateral(alice.address, USDC.address, sanToken.address, perpetual.address);
      // using alice as a poolManager
      const gaugeRevert = (await new MockLiquidityGauge__factory(deployer).deploy(USDC.address)) as MockLiquidityGauge;
      await expect(
        router.connect(alice).addPairs([agEUR.address], [alice.address], [gaugeRevert.address], [false]),
      ).to.be.revertedWith('InvalidParams');
    });
    it('reverts - when pair has already been added', async () => {
      await router.connect(alice).addStableMaster(agEUR.address, stableMaster.address);
      await stableMaster.addCollateral(alice.address, USDC.address, sanToken.address, perpetual.address);
      // using alice as a poolManager
      await router.connect(alice).addPairs([agEUR.address], [alice.address], [gauge.address], [false]);
      await expect(
        router.connect(alice).addPairs([agEUR.address], [alice.address], [gauge.address], [false]),
      ).to.be.revertedWith('InvalidParams');
    });
    it('reverts - when invalid collateral', async () => {
      await router.connect(alice).addStableMaster(agEUR.address, stableMaster.address);
      await expect(
        router.connect(alice).addPairs([agEUR.address], [alice.address], [gauge.address], [false]),
      ).to.be.revertedWith('InvalidParams');
    });
    it('success - pair already added without gauge and adding liquidity gauge', async () => {
      await router.connect(alice).addStableMaster(agEUR.address, stableMaster.address);
      await stableMaster.addCollateral(alice.address, USDC.address, sanToken.address, perpetual.address);
      // using alice as a poolManager
      await router.connect(alice).addPairs([agEUR.address], [alice.address], [ZERO_ADDRESS], [false]);
      await router.connect(alice).addPairs([agEUR.address], [alice.address], [gauge.address], [true]);
      expect(await USDC.allowance(router.address, stableMaster.address)).to.be.equal(MAX_UINT256);
      expect(await USDC.allowance(router.address, perpetual.address)).to.be.equal(MAX_UINT256);
      expect(await sanToken.allowance(router.address, gauge.address)).to.be.equal(MAX_UINT256);
      const pair = await router.mapPoolManagers(stableMaster.address, USDC.address);
      expect(pair.poolManager).to.be.equal(alice.address);
      expect(pair.sanToken).to.be.equal(sanToken.address);
      expect(pair.perpetualManager).to.be.equal(perpetual.address);
      expect(pair.gauge).to.be.equal(gauge.address);
    });
    it('success - pair already added with gauge and adding a new liquidity gauge', async () => {
      await router.connect(alice).addStableMaster(agEUR.address, stableMaster.address);
      await stableMaster.addCollateral(alice.address, USDC.address, sanToken.address, perpetual.address);
      // using alice as a poolManager
      await router.connect(alice).addPairs([agEUR.address], [alice.address], [gauge.address], [false]);
      const newGauge = (await new MockLiquidityGauge__factory(deployer).deploy(sanToken.address)) as MockLiquidityGauge;
      await router.connect(alice).addPairs([agEUR.address], [alice.address], [newGauge.address], [true]);
      expect(await USDC.allowance(router.address, stableMaster.address)).to.be.equal(MAX_UINT256);
      expect(await USDC.allowance(router.address, perpetual.address)).to.be.equal(MAX_UINT256);
      expect(await sanToken.allowance(router.address, gauge.address)).to.be.equal(0);
      expect(await sanToken.allowance(router.address, newGauge.address)).to.be.equal(MAX_UINT256);
      const pair = await router.mapPoolManagers(stableMaster.address, USDC.address);
      expect(pair.poolManager).to.be.equal(alice.address);
      expect(pair.sanToken).to.be.equal(sanToken.address);
      expect(pair.perpetualManager).to.be.equal(perpetual.address);
      expect(pair.gauge).to.be.equal(newGauge.address);
    });
    it('reverts - adding just gauge on a pair which does not exist yet', async () => {
      await router.connect(alice).addStableMaster(agEUR.address, stableMaster.address);
      await stableMaster.addCollateral(alice.address, USDC.address, sanToken.address, perpetual.address);
      // using alice as a poolManager
      await expect(
        router.connect(alice).addPairs([agEUR.address], [alice.address], [gauge.address], [true]),
      ).to.be.revertedWith('ZeroAddress');
    });
  });
});
