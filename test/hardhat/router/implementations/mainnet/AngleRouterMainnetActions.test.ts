import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, BytesLike } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import hre, { contract, ethers } from 'hardhat';

import {
  ERC20,
  ERC20__factory,
  Mock1Inch,
  Mock1Inch__factory,
  MockAgToken,
  MockAgToken__factory,
  MockAngleRouterMainnet,
  MockAngleRouterMainnet__factory,
  MockCoreBorrow,
  MockCoreBorrow__factory,
  MockFeeDistributor,
  MockFeeDistributor__factory,
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
import { ActionType, TypePermit } from '../../../../../utils/helpers';
import { deployUpgradeable, expectApprox, MAX_UINT256, ZERO_ADDRESS } from '../../../utils/helpers';

contract('AngleRouterMainnet - Actions', () => {
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
  let feeDistrib: MockFeeDistributor;
  let sanToken: MockTokenPermit;
  let permits: TypePermit[];

  before(async () => {
    ({ deployer, alice, bob } = await ethers.getNamedSigners());
    permits = [];
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
    feeDistrib = (await new MockFeeDistributor__factory(deployer).deploy()) as MockFeeDistributor;
    await feeDistrib.setToken(sanToken.address);
  });
  /*
  describe('claimRewardsWithPerps', () => {
    it('success - when just liquidity gauges', async () => {
      const claimData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address[]', 'uint256[]', 'bool', 'address[]', 'address[]'],
        [bob.address, [gauge.address], [], false, [], []],
      );
      const actions = [ActionType.claimRewardsWithPerps];
      const dataMixer = [claimData];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await gauge.counter(bob.address)).to.be.equal(1);
    });
    it('success - when multiple claims', async () => {
      const claimData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address[]', 'uint256[]', 'bool', 'address[]', 'address[]'],
        [bob.address, [gauge.address], [], false, [], []],
      );
      const actions = [ActionType.claimRewardsWithPerps, ActionType.claimRewardsWithPerps];
      const dataMixer = [claimData, claimData];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await gauge.counter(bob.address)).to.be.equal(2);
    });
    it('reverts - when incompatible lengths', async () => {
      const claimData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address[]', 'uint256[]', 'bool', 'address[]', 'address[]'],
        [bob.address, [gauge.address], [1, 2], true, [ZERO_ADDRESS], [perpetual.address]],
      );
      const actions = [ActionType.claimRewardsWithPerps];
      const dataMixer = [claimData];
      await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.revertedWith('IncompatibleLengths');
    });
    it('success - when processed perpetual address', async () => {
      const claimData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address[]', 'uint256[]', 'bool', 'address[]', 'address[]'],
        [bob.address, [gauge.address], [1], true, [ZERO_ADDRESS], [perpetual.address]],
      );
      const actions = [ActionType.claimRewardsWithPerps];
      const dataMixer = [claimData];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await gauge.counter(bob.address)).to.be.equal(1);
      expect(await perpetual.claims(1)).to.be.equal(1);
    });
    it('reverts - when not processed and invalid address 1/2', async () => {
      const claimData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address[]', 'uint256[]', 'bool', 'address[]', 'address[]'],
        [bob.address, [gauge.address], [1], false, [USDC.address], [perpetual.address]],
      );
      const actions = [ActionType.claimRewardsWithPerps];
      const dataMixer = [claimData];
      await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.revertedWith('ZeroAddress');
    });
    it('reverts - when not processed and invalid address 2/2', async () => {
      const claimData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address[]', 'uint256[]', 'bool', 'address[]', 'address[]'],
        [bob.address, [gauge.address], [1], false, [agEUR.address], [sanToken.address]],
      );
      const actions = [ActionType.claimRewardsWithPerps];
      const dataMixer = [claimData];
      await router.connect(alice).addStableMaster(agEUR.address, stableMaster.address);
      await stableMaster.addCollateral(alice.address, USDC.address, sanToken.address, perpetual.address);
      await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.revertedWith('ZeroAddress');
    });
    it('success - when not processed address', async () => {
      const claimData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address[]', 'uint256[]', 'bool', 'address[]', 'address[]'],
        [bob.address, [gauge.address], [1], false, [agEUR.address], [USDC.address]],
      );
      const actions = [ActionType.claimRewardsWithPerps];
      const dataMixer = [claimData];
      await router.connect(alice).addStableMaster(agEUR.address, stableMaster.address);
      await stableMaster.addCollateral(alice.address, USDC.address, sanToken.address, perpetual.address);
      await router.connect(alice).addPairs([agEUR.address], [alice.address], [gauge.address], [false]);
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await gauge.counter(bob.address)).to.be.equal(1);
      expect(await perpetual.claims(1)).to.be.equal(1);
    });
  });
  describe('claimWeeklyInterest', () => {
    it('success - nothing can be claimed', async () => {
      const claimData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'bool'],
        [bob.address, feeDistrib.address, false],
      );
      const actions = [ActionType.claimWeeklyInterest];
      const dataMixer = [claimData];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await sanToken.balanceOf(bob.address)).to.be.equal(0);
    });
    it('success - something can be claimed', async () => {
      const claimData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'bool'],
        [bob.address, feeDistrib.address, false],
      );
      await sanToken.mint(feeDistrib.address, parseEther('1'));
      const actions = [ActionType.claimWeeklyInterest];
      const dataMixer = [claimData];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await sanToken.balanceOf(bob.address)).to.be.equal(parseEther('1'));
      expect(await sanToken.balanceOf(feeDistrib.address)).to.be.equal(parseEther('0'));
    });
    it('reverts - something can be claimed and let in contract but no approval', async () => {
      const claimData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'bool'],
        [bob.address, feeDistrib.address, true],
      );
      await sanToken.mint(feeDistrib.address, parseEther('1'));
      const actions = [ActionType.claimWeeklyInterest];
      const dataMixer = [claimData];
      await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.reverted;
    });
    it('success - something can be claimed and let in contract and approval', async () => {
      const claimData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'bool'],
        [bob.address, feeDistrib.address, true],
      );
      await sanToken.mint(feeDistrib.address, parseEther('1'));
      const actions = [ActionType.claimWeeklyInterest];
      const dataMixer = [claimData];
      await sanToken.connect(bob).approve(router.address, MAX_UINT256);
      await router.connect(bob).mixer(permits, actions, dataMixer);
      expect(await sanToken.balanceOf(bob.address)).to.be.equal(parseEther('0'));
      expect(await sanToken.balanceOf(router.address)).to.be.equal(parseEther('1'));
      expect(await sanToken.balanceOf(feeDistrib.address)).to.be.equal(parseEther('0'));
    });
  });
  describe('mint', () => {
    it('success - when addresses are processed', async () => {
      await USDC.mint(alice.address, parseUnits('1', 6));
      await USDC.connect(alice).approve(router.address, parseUnits('1', 6));
      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, parseUnits('0.3', 6)],
      );
      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'uint256', 'bool', 'address', 'address', 'address'],
        [bob.address, parseUnits('0.3', 6), 0, true, stableMaster.address, ZERO_ADDRESS, alice.address],
      );
      const actions = [ActionType.transfer, ActionType.mint];
      const dataMixer = [transferData, mintData];
      await router.connect(alice).addStableMaster(agEUR.address, stableMaster.address);
      await stableMaster.addCollateral(alice.address, USDC.address, sanToken.address, perpetual.address);
      await router.connect(alice).addPairs([agEUR.address], [alice.address], [gauge.address], [false]);
      await USDC.connect(alice).approve(router.address, MAX_UINT256);
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.balanceOf(stableMaster.address)).to.be.equal(parseUnits('0.3', 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0.7', 6));
      expect(await agEUR.balanceOf(bob.address)).to.be.equal(parseUnits('0.3', 6));
    });
    it('success - when addresses are not processed', async () => {
      await USDC.mint(alice.address, parseUnits('1', 6));
      await USDC.connect(alice).approve(router.address, parseUnits('1', 6));
      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, parseUnits('0.3', 6)],
      );
      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'uint256', 'bool', 'address', 'address', 'address'],
        [bob.address, parseUnits('0.3', 6), 0, false, agEUR.address, USDC.address, ZERO_ADDRESS],
      );
      const actions = [ActionType.transfer, ActionType.mint];
      const dataMixer = [transferData, mintData];
      await router.connect(alice).addStableMaster(agEUR.address, stableMaster.address);
      await stableMaster.addCollateral(alice.address, USDC.address, sanToken.address, perpetual.address);
      await router.connect(alice).addPairs([agEUR.address], [alice.address], [gauge.address], [false]);
      await USDC.connect(alice).approve(router.address, MAX_UINT256);
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.balanceOf(stableMaster.address)).to.be.equal(parseUnits('0.3', 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0.7', 6));
      expect(await agEUR.balanceOf(bob.address)).to.be.equal(parseUnits('0.3', 6));
    });
  });
  describe('depositOnLocker', () => {
    it('success - deposit made', async () => {
      await ANGLE.mint(alice.address, parseEther('1'));
      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [ANGLE.address, router.address, parseEther('1')],
      );
      const depositData = ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [bob.address, parseEther('1')]);
      const actions = [ActionType.transfer, ActionType.veANGLEDeposit];
      const dataMixer = [transferData, depositData];
      await ANGLE.connect(alice).approve(router.address, MAX_UINT256);
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await ANGLE.balanceOf(veANGLE.address)).to.be.equal(parseEther('1'));
      expect(await veANGLE.counter(bob.address)).to.be.equal(parseEther('1'));
    });
  });
  describe('deposit', () => {
    it('success - deposit made when addresses processed', async () => {
      await USDC.mint(alice.address, parseUnits('1', 6));
      await USDC.connect(alice).approve(router.address, parseUnits('1', 6));
      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, parseUnits('0.3', 6)],
      );
      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'bool', 'address', 'address', 'address'],
        [bob.address, parseUnits('0.3', 6), true, stableMaster.address, ZERO_ADDRESS, alice.address],
      );
      const actions = [ActionType.transfer, ActionType.deposit];
      const dataMixer = [transferData, mintData];
      await router.connect(alice).addStableMaster(agEUR.address, stableMaster.address);
      await stableMaster.addCollateral(alice.address, USDC.address, sanToken.address, perpetual.address);
      await router.connect(alice).addPairs([agEUR.address], [alice.address], [gauge.address], [false]);
      await USDC.connect(alice).approve(router.address, MAX_UINT256);
      await sanToken.mint(stableMaster.address, parseUnits('0.3', 6));
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.balanceOf(stableMaster.address)).to.be.equal(parseUnits('0.3', 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0.7', 6));
      expect(await sanToken.balanceOf(bob.address)).to.be.equal(parseUnits('0.3', 6));
    });
    it('success - deposit made when addresses are not processed processed', async () => {
      await USDC.mint(alice.address, parseUnits('1', 6));
      await USDC.connect(alice).approve(router.address, parseUnits('1', 6));
      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, parseUnits('0.3', 6)],
      );
      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'bool', 'address', 'address', 'address'],
        [bob.address, parseUnits('0.3', 6), false, agEUR.address, USDC.address, ZERO_ADDRESS],
      );
      const actions = [ActionType.transfer, ActionType.deposit];
      const dataMixer = [transferData, mintData];
      await router.connect(alice).addStableMaster(agEUR.address, stableMaster.address);
      await stableMaster.addCollateral(alice.address, USDC.address, sanToken.address, perpetual.address);
      await router.connect(alice).addPairs([agEUR.address], [alice.address], [gauge.address], [false]);
      await USDC.connect(alice).approve(router.address, MAX_UINT256);
      await sanToken.mint(stableMaster.address, parseUnits('0.3', 6));
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.balanceOf(stableMaster.address)).to.be.equal(parseUnits('0.3', 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0.7', 6));
      expect(await sanToken.balanceOf(bob.address)).to.be.equal(parseUnits('0.3', 6));
    });
  });
  */
  describe('withdraw', () => {
    it('success - withdraw made when addresses processed', async () => {
      await USDC.mint(alice.address, parseUnits('1', 6));
      await USDC.connect(alice).approve(router.address, parseUnits('1', 6));
      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, parseUnits('0.3', 6)],
      );
      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'bool', 'address', 'address', 'address'],
        [bob.address, parseUnits('0.3', 6), true, stableMaster.address, ZERO_ADDRESS, alice.address],
      );
      const actions = [ActionType.transfer, ActionType.deposit];
      const dataMixer = [transferData, mintData];
      await router.connect(alice).addStableMaster(agEUR.address, stableMaster.address);
      await stableMaster.addCollateral(alice.address, USDC.address, sanToken.address, perpetual.address);
      await router.connect(alice).addPairs([agEUR.address], [alice.address], [gauge.address], [false]);
      await USDC.connect(alice).approve(router.address, MAX_UINT256);
      await sanToken.mint(stableMaster.address, parseUnits('0.3', 6));
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.balanceOf(stableMaster.address)).to.be.equal(parseUnits('0.3', 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0.7', 6));
      expect(await sanToken.balanceOf(bob.address)).to.be.equal(parseUnits('0.3', 6));
    });
  });
});
