import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, BytesLike, Signer } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import hre, { contract, ethers, web3 } from 'hardhat';

import {
  Mock1Inch,
  Mock1Inch__factory,
  MockAgToken,
  MockAgToken__factory,
  MockCoreBorrow,
  MockCoreBorrow__factory,
  MockLiquidityGauge,
  MockLiquidityGauge__factory,
  MockRouterSidechain,
  MockRouterSidechain__factory,
  MockTokenPermit,
  MockTokenPermit__factory,
  MockUniswapV3Router,
  MockUniswapV3Router__factory,
} from '../../../typechain';
import { expect } from '../../../utils/chai-setup';
import { inReceipt } from '../../../utils/expectEvent';
import { ActionType, TypePermit } from '../../../utils/helpers';
import { deployUpgradeable, MAX_UINT256, ZERO_ADDRESS } from '../utils/helpers';

contract('BaseAngleRouterSideChain', () => {
  // As a proxy for the BaseAngleRouterSideChain we're using a mock Ethereum implementation of it
  let deployer: SignerWithAddress;
  let USDC: MockTokenPermit;
  let lzAgEUR: MockTokenPermit;
  let agEUR: MockAgToken;
  let core: MockCoreBorrow;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let uniswap: MockUniswapV3Router;
  let oneInch: Mock1Inch;
  let router: MockRouterSidechain;
  let UNIT_USDC: BigNumber;
  let USDCdecimal: BigNumber;
  let governor: string;
  let guardian: string;
  let permits: TypePermit[];

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

    UNIT_USDC = BigNumber.from(10).pow(USDCdecimal);
    permits = [];
  });

  beforeEach(async () => {
    // If the forked-network state needs to be reset between each test, run this
    router = (await deployUpgradeable(new MockRouterSidechain__factory(deployer))) as MockRouterSidechain;
    USDC = (await new MockTokenPermit__factory(deployer).deploy('USDC', 'USDC', USDCdecimal)) as MockTokenPermit;
    lzAgEUR = (await new MockTokenPermit__factory(deployer).deploy('lzAgEUR', 'lzAgEUR', '18')) as MockTokenPermit;
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
      const router2 = (await deployUpgradeable(new MockRouterSidechain__factory(deployer))) as MockRouterSidechain;
      await expect(router2.initializeRouter(ZERO_ADDRESS, uniswap.address, oneInch.address)).to.be.revertedWith(
        'ZeroAddress',
      );
    });
  });
  describe('setCore', () => {
    it('reverts - not governor', async () => {
      const core2 = (await new MockCoreBorrow__factory(deployer).deploy()) as MockCoreBorrow;
      await expect(router.connect(bob).setCore(core2.address)).to.be.revertedWith('NotGovernor');
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
  describe('setRouter', () => {
    it('success - addresses updated', async () => {
      await router.connect(impersonatedSigners[governor]).setRouter(bob.address, 0);
      expect(await router.uniswapV3Router()).to.be.equal(bob.address);
      await router.connect(impersonatedSigners[governor]).setRouter(alice.address, 1);
      expect(await router.oneInch()).to.be.equal(alice.address);
    });
  });

  describe('claimRewards', () => {
    it('success - when one gauge', async () => {
      const gauge = (await new MockLiquidityGauge__factory(deployer).deploy(USDC.address)) as MockLiquidityGauge;
      await router.claimRewards(bob.address, [gauge.address]);
    });
  });
  describe('mixer', () => {
    describe('swapIn', () => {
      it('reverts - without approval from the contract', async () => {
        const actions = [ActionType.transfer, ActionType.swapIn];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [lzAgEUR.address, router.address, parseEther('1')],
        );

        const swapInData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256', 'uint256', 'address'],
          [agEUR.address, lzAgEUR.address, parseEther('1'), parseEther('1'), bob.address],
        );
        await lzAgEUR.mint(alice.address, parseEther('1'));
        await lzAgEUR.connect(alice).approve(router.address, parseEther('1'));

        const dataMixer = [transferData, swapInData];

        await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.reverted;
      });
      it('success - with approval from the contract', async () => {
        const actions = [ActionType.transfer, ActionType.swapIn];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [lzAgEUR.address, router.address, parseEther('1')],
        );

        const swapInData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256', 'uint256', 'address'],
          [agEUR.address, lzAgEUR.address, parseEther('1'), parseEther('1'), bob.address],
        );
        await lzAgEUR.mint(alice.address, parseEther('1'));
        await lzAgEUR.connect(alice).approve(router.address, parseEther('1'));

        const dataMixer = [transferData, swapInData];
        await router
          .connect(impersonatedSigners[governor])
          .changeAllowance([lzAgEUR.address], [agEUR.address], [MAX_UINT256]);

        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await agEUR.balanceOf(bob.address)).to.be.equal(parseEther('1'));
        expect(await lzAgEUR.balanceOf(agEUR.address)).to.be.equal(parseEther('1'));
      });
      it('success - with approval from the contract and fees', async () => {
        const actions = [ActionType.transfer, ActionType.swapIn];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [lzAgEUR.address, router.address, parseEther('1')],
        );

        await agEUR.setFees(parseUnits('0.5', 9), parseUnits('1', 9));

        const swapInData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256', 'uint256', 'address'],
          [agEUR.address, lzAgEUR.address, parseEther('1'), parseEther('0.5'), bob.address],
        );
        await lzAgEUR.mint(alice.address, parseEther('1'));
        await lzAgEUR.connect(alice).approve(router.address, parseEther('1'));

        const dataMixer = [transferData, swapInData];
        await router
          .connect(impersonatedSigners[governor])
          .changeAllowance([lzAgEUR.address], [agEUR.address], [MAX_UINT256]);

        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await agEUR.balanceOf(bob.address)).to.be.equal(parseEther('0.5'));
        expect(await lzAgEUR.balanceOf(agEUR.address)).to.be.equal(parseEther('1'));
      });
      it('reverts - when slippage from the contract and fees', async () => {
        const actions = [ActionType.transfer, ActionType.swapIn];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [lzAgEUR.address, router.address, parseEther('1')],
        );
        await agEUR.setFees(parseUnits('0.5', 9), parseUnits('1', 9));

        const swapInData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256', 'uint256', 'address'],
          [agEUR.address, lzAgEUR.address, parseEther('1'), parseEther('1'), bob.address],
        );
        await lzAgEUR.mint(alice.address, parseEther('1'));
        await lzAgEUR.connect(alice).approve(router.address, parseEther('1'));

        const dataMixer = [transferData, swapInData];
        await router
          .connect(impersonatedSigners[governor])
          .changeAllowance([lzAgEUR.address], [agEUR.address], [MAX_UINT256]);

        await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.revertedWith('TooSmallAmountOut');
      });
      it('reverts - when slippage', async () => {
        const actions = [ActionType.transfer, ActionType.swapIn];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [lzAgEUR.address, router.address, parseEther('1')],
        );

        const swapInData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256', 'uint256', 'address'],
          [agEUR.address, lzAgEUR.address, parseEther('1'), parseEther('2'), bob.address],
        );
        await lzAgEUR.mint(alice.address, parseEther('1'));
        await lzAgEUR.connect(alice).approve(router.address, parseEther('1'));

        const dataMixer = [transferData, swapInData];
        await router
          .connect(impersonatedSigners[governor])
          .changeAllowance([lzAgEUR.address], [agEUR.address], [MAX_UINT256]);

        await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.revertedWith('TooSmallAmountOut');
      });
    });
    describe('swapOut', () => {
      it('reverts - when there are no bridge tokens in the contract', async () => {
        const actions = [ActionType.transfer, ActionType.swapOut];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [agEUR.address, router.address, parseEther('1')],
        );

        const swapInData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256', 'uint256', 'address'],
          [agEUR.address, lzAgEUR.address, parseEther('1'), parseEther('1'), bob.address],
        );
        await agEUR.mint(alice.address, parseEther('1'));
        await agEUR.connect(alice).approve(router.address, parseEther('1'));

        const dataMixer = [transferData, swapInData];

        await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.reverted;
      });
      it('success - with bridge tokens on the contract', async () => {
        const actions = [ActionType.transfer, ActionType.swapOut];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [agEUR.address, router.address, parseEther('1')],
        );

        const swapInData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256', 'uint256', 'address'],
          [agEUR.address, lzAgEUR.address, parseEther('1'), parseEther('1'), bob.address],
        );
        await agEUR.mint(alice.address, parseEther('1'));
        await agEUR.connect(alice).approve(router.address, parseEther('1'));
        await lzAgEUR.mint(agEUR.address, parseEther('1'));

        const dataMixer = [transferData, swapInData];

        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await agEUR.balanceOf(alice.address)).to.be.equal(parseEther('0'));
        expect(await lzAgEUR.balanceOf(bob.address)).to.be.equal(parseEther('1'));
      });
      it('success - with approval from the contract and fees', async () => {
        const actions = [ActionType.transfer, ActionType.swapOut];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [agEUR.address, router.address, parseEther('1')],
        );
        await agEUR.setFees(parseUnits('1', 9), parseUnits('0.5', 9));

        const swapInData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256', 'uint256', 'address'],
          [agEUR.address, lzAgEUR.address, parseEther('1'), parseEther('0.5'), bob.address],
        );
        await agEUR.mint(alice.address, parseEther('1'));
        await agEUR.connect(alice).approve(router.address, parseEther('1'));
        await lzAgEUR.mint(agEUR.address, parseEther('1'));

        const dataMixer = [transferData, swapInData];
        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await agEUR.balanceOf(alice.address)).to.be.equal(parseEther('0'));
        expect(await lzAgEUR.balanceOf(bob.address)).to.be.equal(parseEther('0.5'));
      });
      it('reverts - when slippage from the contract and fees', async () => {
        const actions = [ActionType.transfer, ActionType.swapOut];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [agEUR.address, router.address, parseEther('1')],
        );
        await agEUR.setFees(parseUnits('1', 9), parseUnits('0.5', 9));

        const swapInData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256', 'uint256', 'address'],
          [agEUR.address, lzAgEUR.address, parseEther('1'), parseEther('1'), bob.address],
        );
        await agEUR.mint(alice.address, parseEther('1'));
        await agEUR.connect(alice).approve(router.address, parseEther('1'));
        await lzAgEUR.mint(agEUR.address, parseEther('1'));

        const dataMixer = [transferData, swapInData];
        await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.revertedWith('TooSmallAmountOut');
      });
      it('reverts - when slippage', async () => {
        const actions = [ActionType.transfer, ActionType.swapOut];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [agEUR.address, router.address, parseEther('1')],
        );

        const swapInData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256', 'uint256', 'address'],
          [agEUR.address, lzAgEUR.address, parseEther('1'), parseEther('2'), bob.address],
        );
        await agEUR.mint(alice.address, parseEther('1'));
        await agEUR.connect(alice).approve(router.address, parseEther('1'));
        await lzAgEUR.mint(agEUR.address, parseEther('1'));

        const dataMixer = [transferData, swapInData];
        await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.revertedWith('TooSmallAmountOut');
      });
    });
  });
});
