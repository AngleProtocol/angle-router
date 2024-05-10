import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { contract, ethers } from 'hardhat';

import {
  Mock1Inch,
  Mock1Inch__factory,
  MockAgToken,
  MockAgToken__factory,
  MockAngleRouterMainnet,
  MockAngleRouterMainnet__factory,
  MockAngleRouterMainnet2,
  MockAngleRouterMainnet2__factory,
  MockCoreBorrow,
  MockCoreBorrow__factory,
  MockFeeDistributor,
  MockFeeDistributor__factory,
  MockTokenPermit,
  MockTokenPermit__factory,
  MockUniswapV3Router,
  MockUniswapV3Router__factory,
  MockVeANGLE,
  MockVeANGLE__factory,
} from '../../../typechain';
import { expect } from '../../../utils/chai-setup';
import { ActionType, TypePermit } from '../../../utils/helpers';
import { deployUpgradeable, MAX_UINT256, ZERO_ADDRESS } from '../../../test/hardhat/utils/helpers';

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
    await router.initializeRouter(core.address, uniswap.address, oneInch.address);
    sanToken = (await new MockTokenPermit__factory(deployer).deploy('sanUSDC', 'sanUSDC', 6)) as MockTokenPermit;
    feeDistrib = (await new MockFeeDistributor__factory(deployer).deploy()) as MockFeeDistributor;
    await feeDistrib.setToken(sanToken.address);
  });
  describe('getVeANGLE', () => {
    it('success - right address', async () => {
      const router2 = (await new MockAngleRouterMainnet2__factory(deployer).deploy()) as MockAngleRouterMainnet2;
      expect(await router2.getVeANGLE()).to.be.equal('0x0C462Dbb9EC8cD1630f1728B2CFD2769d09f0dd5');
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
  describe('depositOnLocker', () => {
    it('success - deposit made', async () => {
      await ANGLE.mint(alice.address, parseEther('1'));
      await router.connect(alice).changeAllowance([ANGLE.address], [veANGLE.address], [MAX_UINT256]);
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
  describe('unsupported action', () => {
    it('success - nothing happens', async () => {
      await USDC.mint(alice.address, parseUnits('1', 6));
      await USDC.connect(alice).approve(router.address, parseUnits('1', 6));
      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, parseUnits('0.3', 6)],
      );
      const actions = [ActionType.transfer, ActionType.swapIn];
      const dataMixer = [transferData, transferData];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.balanceOf(router.address)).to.be.equal(parseUnits('0.3', 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0.7', 6));
    });
  });
});
