import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, Signer } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import hre, { contract, ethers } from 'hardhat';

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

  describe('claimRewards', () => {
    it('success - when one gauge', async () => {
      const gauge = (await new MockLiquidityGauge__factory(deployer).deploy(USDC.address)) as MockLiquidityGauge;
      await router.claimRewards(bob.address, [gauge.address]);
    });
  });
  describe('mixer', () => {
    describe('non supported action', () => {
      it('success - nothing happens', async () => {
        const actions = [ActionType.veANGLEDeposit, ActionType.addToPerpetual];
        const data1 = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [lzAgEUR.address, router.address, parseEther('1')],
        );
        await router.connect(alice).mixer(permits, actions, [data1, data1]);
      });
    });
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
