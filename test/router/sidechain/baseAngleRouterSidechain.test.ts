import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { BigNumber, BytesLike, Signer } from 'ethers';
import hre, { contract, ethers } from 'hardhat';

import {
  AngleRouterPolygon,
  AngleRouterPolygon__factory,
  MockAgToken,
  MockAgToken__factory,
  MockCoreBorrow,
  MockCoreBorrow__factory,
  MockTokenPermit,
  MockTokenPermit__factory,
  MockUniswapV3Router,
  MockUniswapV3Router__factory,
  Mock1Inch,
  Mock1Inch__factory,
} from '../../../typechain';
import { expect } from '../../../utils/chai-setup';
import { inReceipt } from '../../../utils/expectEvent';
import { ActionTypeSidechain, initToken, TypePermit } from '../../../utils/helpers';
import { deployUpgradeable, latestTime, ZERO_ADDRESS, MAX_UINT256 } from '../../utils/helpers';

contract('BaseAngleRouterSidechain', () => {
  // As a proxy for the AngleRouter sidechain we're using the Polygon implementation of it
  let deployer: SignerWithAddress;
  let USDC: MockTokenPermit;
  let agEUR: MockAgToken;
  let core: MockCoreBorrow;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let uniswap: MockUniswapV3Router;
  let oneInch: Mock1Inch;
  let router: AngleRouterPolygon;
  let UNIT_USDC: BigNumber;
  let UNIT_DAI: BigNumber;
  let USDCdecimal: BigNumber;
  let DAIdecimal: BigNumber;
  let governor: string;
  let guardian: string;

  const impersonatedSigners: { [key: string]: Signer } = {};

  before(async () => {
    ({ deployer, alice, bob } = await ethers.getNamedSigners());
    // add any addresses you want to impersonate here
    governor = '0xdC4e6DFe07EFCa50a197DF15D9200883eF4Eb1c8';
    guardian = '0x0C2553e4B9dFA9f83b1A6D3EAB96c4bAaB42d430';
    const impersonatedAddresses = [governor, guardian];

    for (const address of impersonatedAddresses) {
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [address],
      });
      await hre.network.provider.send('hardhat_setBalance', [address, '0x10000000000000000000000000000']);
      impersonatedSigners[address] = await ethers.getSigner(address);
    }
    USDCdecimal = BigNumber.from('6');
    DAIdecimal = BigNumber.from('18');

    UNIT_USDC = BigNumber.from(10).pow(USDCdecimal);
    UNIT_DAI = BigNumber.from(10).pow(DAIdecimal);
  });

  beforeEach(async () => {
    // If the forked-network state needs to be reset between each test, run this
    router = (await deployUpgradeable(new AngleRouterPolygon__factory(deployer))) as AngleRouterPolygon;
    USDC = (await new MockTokenPermit__factory(deployer).deploy('USDC', 'USDC', USDCdecimal)) as MockTokenPermit;
    agEUR = (await deployUpgradeable(new MockAgToken__factory(deployer))) as MockAgToken;
    await agEUR.initialize('agEUR', 'agEUR', ZERO_ADDRESS, ZERO_ADDRESS);
    uniswap = (await new MockUniswapV3Router__factory(deployer).deploy(
      USDC.address,
      agEUR.address,
    )) as MockUniswapV3Router;
    oneInch = (await new Mock1Inch__factory(deployer).deploy(USDC.address, agEUR.address)) as Mock1Inch;
    core = (await new MockCoreBorrow__factory(deployer).deploy()) as MockCoreBorrow;
    await core.toggleGovernor(governor);
    await core.toggleGuardian(governor);
    await core.toggleGuardian(guardian);
    await router.initializeRouter(core.address, uniswap.address, oneInch.address);
  });
  describe('initializeRouter', () => {
    it('success - variables correctly set', async () => {
      expect(await router.core()).to.be.equal(core.address);
      expect(await router.uniswapV3Router()).to.be.equal(uniswap.address);
      expect(await router.oneInch()).to.be.equal(oneInch.address);
    });
    it('reverts - already initialized', async () => {
      await expect(router.initializeRouter(core.address, uniswap.address, oneInch.address)).to.be.revertedWith(
        'Initializable: contract is already initialized',
      );
    });
    it('reverts - zero address', async () => {
      const router2 = (await deployUpgradeable(new AngleRouterPolygon__factory(deployer))) as AngleRouterPolygon;
      await expect(router2.initializeRouter(ZERO_ADDRESS, uniswap.address, oneInch.address)).to.be.revertedWith(
        'ZeroAddress',
      );
    });
  });
  describe('setCore', () => {
    it('reverts - not governor', async () => {
      await expect(router.connect(bob).setCore(governor)).to.be.revertedWith('NotGovernor');
    });
    it('reverts - invalid core contract', async () => {
      const core2 = (await new MockCoreBorrow__factory(deployer).deploy()) as MockCoreBorrow;
      await expect(router.connect(impersonatedSigners[governor]).setCore(core2.address)).to.be.revertedWith(
        'NotGovernor',
      );
    });
    it('success - valid core contract', async () => {
      const core2 = (await new MockCoreBorrow__factory(deployer).deploy()) as MockCoreBorrow;
      await core2.toggleGovernor(governor);
      const receipt = await (await router.connect(impersonatedSigners[governor]).setCore(core2.address)).wait();
      inReceipt(receipt, 'CoreUpdated', {
        _core: core2.address,
      });
      expect(await router.core()).to.be.equal(core2.address);
    });
  });
  describe('changeAllowance', () => {
    it('reverts - non governor nor guardian', async () => {
      await expect(
        router.connect(deployer).changeAllowance([USDC.address], [bob.address], [MAX_UINT256]),
      ).to.be.revertedWith('NotGovernorOrGuardian');
    });
    it('reverts - incorrect length', async () => {
      await core.connect(alice).toggleGuardian(alice.address);
      await expect(router.connect(alice).changeAllowance([], [router.address], [MAX_UINT256])).to.be.revertedWith(
        'IncompatibleLengths',
      );
      await expect(router.connect(alice).changeAllowance([USDC.address], [router.address], [])).to.be.revertedWith(
        'IncompatibleLengths',
      );
      await expect(router.connect(alice).changeAllowance([USDC.address], [], [MAX_UINT256])).to.be.revertedWith(
        'IncompatibleLengths',
      );
    });
    it('success - allowance increased on random token', async () => {
      await core.connect(alice).toggleGuardian(alice.address);
      await router.connect(alice).changeAllowance([USDC.address], [bob.address], [parseEther('3.33')]);
      expect(await USDC.allowance(router.address, bob.address)).to.be.equal(parseEther('3.33'));
    });
    it('success - allowance decreased on random token', async () => {
      await core.connect(alice).toggleGuardian(alice.address);
      await router.connect(alice).changeAllowance([USDC.address], [bob.address], [parseEther('3.33')]);
      await router.connect(alice).changeAllowance([USDC.address], [bob.address], [parseEther('2.33')]);
      expect(await USDC.allowance(router.address, bob.address)).to.be.equal(parseEther('2.33'));
      await router.connect(alice).changeAllowance([USDC.address], [bob.address], [parseEther('3.33')]);
      expect(await USDC.allowance(router.address, bob.address)).to.be.equal(parseEther('3.33'));
    });
    it('success - allowance decreased and spender is uniV3', async () => {
      await core.connect(alice).toggleGuardian(alice.address);
      expect(await router.uniAllowedToken(USDC.address)).to.be.equal(false);
      await router.connect(alice).changeAllowance([USDC.address], [uniswap.address], [parseEther('0.5')]);
      expect(await USDC.allowance(router.address, uniswap.address)).to.be.equal(parseEther('0.5'));
      await router.connect(alice).changeAllowance([USDC.address], [uniswap.address], [parseEther('0.3')]);
      expect(await USDC.allowance(router.address, uniswap.address)).to.be.equal(parseEther('0.3'));
      expect(await router.uniAllowedToken(USDC.address)).to.be.equal(false);
    });
    it('success - allowance decreased and spender is oneInch', async () => {
      await core.connect(alice).toggleGuardian(alice.address);
      expect(await router.oneInchAllowedToken(USDC.address)).to.be.equal(false);
      await router.connect(alice).changeAllowance([USDC.address], [oneInch.address], [parseEther('0.5')]);
      expect(await USDC.allowance(router.address, oneInch.address)).to.be.equal(parseEther('0.5'));
      await router.connect(alice).changeAllowance([USDC.address], [oneInch.address], [parseEther('0.3')]);
      expect(await USDC.allowance(router.address, oneInch.address)).to.be.equal(parseEther('0.3'));
      expect(await router.oneInchAllowedToken(USDC.address)).to.be.equal(false);
    });
    it('success - allowance increased on some tokens and decreased on other', async () => {
      await core.connect(alice).toggleGuardian(alice.address);
      await router
        .connect(alice)
        .changeAllowance(
          [USDC.address, agEUR.address],
          [bob.address, alice.address],
          [parseEther('1'), parseEther('3')],
        );
      expect(await USDC.allowance(router.address, bob.address)).to.be.equal(parseEther('1'));
      expect(await agEUR.allowance(router.address, alice.address)).to.be.equal(parseEther('3'));
      await router
        .connect(alice)
        .changeAllowance(
          [USDC.address, agEUR.address],
          [bob.address, alice.address],
          [parseEther('0.9'), parseEther('2')],
        );
      expect(await USDC.allowance(router.address, bob.address)).to.be.equal(parseEther('0.9'));
      expect(await agEUR.allowance(router.address, alice.address)).to.be.equal(parseEther('2'));
    });
  });
  describe('mixer', () => {
    describe('transfer', () => {
      it('success - amount transferred to the vault', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));
        const permits: TypePermit[] = [];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [USDC.address, parseUnits('0.3', USDCdecimal)],
        );
        const actions = [ActionTypeSidechain.transfer];
        const dataMixer = [transferData];

        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0.7', USDCdecimal));
        expect(await USDC.balanceOf(router.address)).to.be.equal(parseUnits('0.3', USDCdecimal));
      });
      it('success - amount transferred to the vault and then swept', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));
        const permits: TypePermit[] = [];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [USDC.address, parseUnits('0.3', USDCdecimal)],
        );
        const sweepData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'address'],
          [USDC.address, parseUnits('0', USDCdecimal), bob.address],
        );
        const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.sweep];
        const dataMixer = [transferData, sweepData];

        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0.7', USDCdecimal));
        expect(await USDC.balanceOf(router.address)).to.be.equal(parseUnits('0', USDCdecimal));
        expect(await USDC.balanceOf(bob.address)).to.be.equal(parseUnits('0.3', USDCdecimal));
      });
    });
    describe('wrap', () => {
      it('success - when there is nothing in the action', async () => {
        const permits: TypePermit[] = [];
        const actions = [ActionTypeSidechain.wrap];

        const wrapData = ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'uint256'],
          [parseEther('10'), parseUnits('0.3', USDCdecimal)],
        );

        const dataMixer = [wrapData];
        await router.connect(alice).mixer(permits, actions, dataMixer);

        const wrapData2 = ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'uint256'],
          [parseUnits('0.3', USDCdecimal), parseUnits('100', USDCdecimal)],
        );
        const dataMixer2 = [wrapData2];
        await router.connect(alice).mixer(permits, actions, dataMixer2);
      });
    });
    describe('unwrap', () => {
      it('success - when there is nothing in the action', async () => {
        const permits: TypePermit[] = [];
        const actions = [ActionTypeSidechain.unwrap];

        const unwrapData = ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'uint256', 'address'],
          [parseEther('10'), parseUnits('0.3', USDCdecimal), bob.address],
        );

        const dataMixer = [unwrapData];
        await router.connect(alice).mixer(permits, actions, dataMixer);

        const unwrapData2 = ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'uint256', 'address'],
          [parseUnits('0.3', USDCdecimal), parseUnits('100', USDCdecimal), bob.address],
        );
        const dataMixer2 = [unwrapData2];
        await router.connect(alice).mixer(permits, actions, dataMixer2);
      });
    });
  });
});
