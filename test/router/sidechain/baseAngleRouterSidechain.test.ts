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
import { ActionTypeSidechain, TypePermit } from '../../../utils/helpers';
import { deployUpgradeable, MAX_UINT256, ZERO_ADDRESS } from '../../utils/helpers';

contract('BaseAngleRouterSidechain', () => {
  // As a proxy for the AngleRouter sidechain we're using a mock Ethereum implementation of it
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
  let DAIdecimal: BigNumber;
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
    DAIdecimal = BigNumber.from('18');

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
    it('success - allowance increased on random token and then maintained equal', async () => {
      await core.connect(alice).toggleGuardian(alice.address);
      await router.connect(alice).changeAllowance([USDC.address], [bob.address], [parseEther('3.33')]);
      expect(await USDC.allowance(router.address, bob.address)).to.be.equal(parseEther('3.33'));
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
      await router.connect(alice).changeAllowance([USDC.address], [uniswap.address], [parseEther('0.5')]);
      expect(await USDC.allowance(router.address, uniswap.address)).to.be.equal(parseEther('0.5'));
      await router.connect(alice).changeAllowance([USDC.address], [uniswap.address], [parseEther('0.3')]);
      expect(await USDC.allowance(router.address, uniswap.address)).to.be.equal(parseEther('0.3'));
    });
    it('success - allowance decreased and spender is oneInch', async () => {
      await core.connect(alice).toggleGuardian(alice.address);
      await router.connect(alice).changeAllowance([USDC.address], [oneInch.address], [parseEther('0.5')]);
      expect(await USDC.allowance(router.address, oneInch.address)).to.be.equal(parseEther('0.5'));
      await router.connect(alice).changeAllowance([USDC.address], [oneInch.address], [parseEther('0.3')]);
      expect(await USDC.allowance(router.address, oneInch.address)).to.be.equal(parseEther('0.3'));
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
  describe('claimRewards', () => {
    it('success - when one gauge', async () => {
      const gauge = (await new MockLiquidityGauge__factory(deployer).deploy(USDC.address)) as MockLiquidityGauge;
      await router.claimRewards(bob.address, [gauge.address]);
    });
  });
  describe('mixer', () => {
    describe('transfer', () => {
      it('success - amount transferred to the vault', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

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
    describe('sweep', () => {
      it('success - when no balance', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const sweepData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'address'],
          [USDC.address, parseUnits('0', USDCdecimal), bob.address],
        );
        const actions = [ActionTypeSidechain.sweep];
        const dataMixer = [sweepData];
        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      });
      it('success - after a transfer', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [USDC.address, parseUnits('0.3', USDCdecimal)],
        );
        const actions = [ActionTypeSidechain.transfer];
        const dataMixer = [transferData];

        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0.7', USDCdecimal));
        expect(await USDC.balanceOf(router.address)).to.be.equal(parseUnits('0.3', USDCdecimal));

        const sweepData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'address'],
          [USDC.address, parseUnits('0', USDCdecimal), bob.address],
        );
        const actions2 = [ActionTypeSidechain.sweep];
        const dataMixer2 = [sweepData];
        await router.connect(alice).mixer(permits, actions2, dataMixer2);
        expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0.7', USDCdecimal));
        expect(await USDC.balanceOf(bob.address)).to.be.equal(parseUnits('0.3', USDCdecimal));
      });
      it('reverts - when slippage', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [USDC.address, parseUnits('0.3', USDCdecimal)],
        );
        const actions = [ActionTypeSidechain.transfer];
        const dataMixer = [transferData];

        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0.7', USDCdecimal));
        expect(await USDC.balanceOf(router.address)).to.be.equal(parseUnits('0.3', USDCdecimal));

        const sweepData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'address'],
          [USDC.address, parseUnits('1', USDCdecimal), bob.address],
        );
        const actions2 = [ActionTypeSidechain.sweep];
        const dataMixer2 = [sweepData];
        await expect(router.connect(alice).mixer(permits, actions2, dataMixer2)).to.be.revertedWith(
          'TooSmallAmountOut',
        );
      });
    });
    describe('wrap', () => {
      it('success - when there is nothing in the action', async () => {
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
    describe('wrapNative', () => {
      it('success - when there is nothing in the action', async () => {
        const actions = [ActionTypeSidechain.wrapNative];
        const dataMixer: BytesLike[] = [];
        await router.connect(alice).mixer(permits, actions, dataMixer);
      });
    });
    describe('unwrap', () => {
      it('success - when there is nothing in the action', async () => {
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
    describe('unwrapNative', () => {
      it('success - when there is nothing in the action', async () => {
        const actions = [ActionTypeSidechain.unwrapNative];
        const wrapData = ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'address'],
          [parseUnits('0.3', USDCdecimal), bob.address],
        );
        const dataMixer = [wrapData];
        await router.connect(alice).mixer(permits, actions, dataMixer);
      });
    });
    describe('swapIn', () => {
      it('reverts - without approval from the contract', async () => {
        const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.swapIn];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [lzAgEUR.address, parseEther('1')],
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
        const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.swapIn];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [lzAgEUR.address, parseEther('1')],
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
        const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.swapIn];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [lzAgEUR.address, parseEther('1')],
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
        const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.swapIn];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [lzAgEUR.address, parseEther('1')],
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
        const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.swapIn];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [lzAgEUR.address, parseEther('1')],
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
        const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.swapOut];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [agEUR.address, parseEther('1')],
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
        const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.swapOut];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [agEUR.address, parseEther('1')],
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
        const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.swapOut];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [agEUR.address, parseEther('1')],
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
        const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.swapOut];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [agEUR.address, parseEther('1')],
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
        const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.swapOut];
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [agEUR.address, parseEther('1')],
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
    describe('claimRewards', () => {
      it('success - nothing happens and one gauge', async () => {
        const gauge = (await new MockLiquidityGauge__factory(deployer).deploy(USDC.address)) as MockLiquidityGauge;

        const actions = [ActionTypeSidechain.claimRewards];
        const claimData = ethers.utils.defaultAbiCoder.encode(['address', 'address[]'], [bob.address, [gauge.address]]);
        const dataMixer = [claimData];
        await router.connect(alice).mixer(permits, actions, dataMixer);
      });
      it('success - nothing happens and two gauges', async () => {
        const gauge = (await new MockLiquidityGauge__factory(deployer).deploy(USDC.address)) as MockLiquidityGauge;
        const gauge2 = (await new MockLiquidityGauge__factory(deployer).deploy(USDC.address)) as MockLiquidityGauge;

        const actions = [ActionTypeSidechain.claimRewards];
        const claimData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address[]'],
          [bob.address, [gauge.address, gauge2.address]],
        );
        const dataMixer = [claimData];
        await router.connect(alice).mixer(permits, actions, dataMixer);
      });
      it('success - nothing happens because no gauge', async () => {
        const actions = [ActionTypeSidechain.claimRewards];
        const claimData = ethers.utils.defaultAbiCoder.encode(['address', 'address[]'], [bob.address, []]);
        const dataMixer = [claimData];
        await router.connect(alice).mixer(permits, actions, dataMixer);
      });
      it('reverts - when invalid gauge', async () => {
        const actions = [ActionTypeSidechain.claimRewards];
        const claimData = ethers.utils.defaultAbiCoder.encode(['address', 'address[]'], [bob.address, [bob.address]]);
        const dataMixer = [claimData];
        await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.reverted;
      });
    });
    describe('gaugeDeposit', () => {
      it('success - nothing happens when correct gauge', async () => {
        const gauge = (await new MockLiquidityGauge__factory(deployer).deploy(USDC.address)) as MockLiquidityGauge;

        const actions = [ActionTypeSidechain.gaugeDeposit];
        const depositData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'address', 'bool'],
          [bob.address, 1, gauge.address, true],
        );
        const dataMixer = [depositData];
        await router.connect(alice).mixer(permits, actions, dataMixer);
      });
      it('reverts - when wrong interface', async () => {
        const actions = [ActionTypeSidechain.gaugeDeposit];
        const depositData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'address', 'bool'],
          [bob.address, 1, bob.address, true],
        );
        const dataMixer = [depositData];
        await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.reverted;
      });
    });

    describe('uniswapV3', () => {
      it('reverts - when tokens are not previously sent', async () => {
        const swapData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'uint256', 'bytes'],
          [USDC.address, parseUnits('1', USDCdecimal), 0, '0x'],
        );
        const dataMixer = [swapData];
        const actions = [ActionTypeSidechain.uniswapV3];
        await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.reverted;
      });
      it('success - swap successfully performed', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [USDC.address, parseUnits('1', USDCdecimal)],
        );
        const swapData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'uint256', 'bytes'],
          [USDC.address, parseUnits('1', USDCdecimal), 0, '0x'],
        );
        const dataMixer = [transferData, swapData];
        const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.uniswapV3];
        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(uniswap.address)).to.be.equal(parseUnits('1', USDCdecimal));
        expect(await agEUR.balanceOf(router.address)).to.be.equal(parseEther('1'));
        expect(await USDC.allowance(router.address, uniswap.address)).to.be.equal(
          MAX_UINT256.sub(parseUnits('1', USDCdecimal)),
        );
      });
      it('success - swap performed and then swept', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [USDC.address, parseUnits('1', USDCdecimal)],
        );
        const swapData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'uint256', 'bytes'],
          [USDC.address, parseUnits('1', USDCdecimal), 0, '0x'],
        );
        const sweepData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'address'],
          [agEUR.address, parseUnits('0', USDCdecimal), bob.address],
        );
        const dataMixer = [transferData, swapData, sweepData];
        const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.uniswapV3, ActionTypeSidechain.sweep];
        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(uniswap.address)).to.be.equal(parseUnits('1', USDCdecimal));
        expect(await agEUR.balanceOf(bob.address)).to.be.equal(parseEther('1'));
        expect(await USDC.allowance(router.address, uniswap.address)).to.be.equal(
          MAX_UINT256.sub(parseUnits('1', USDCdecimal)),
        );
      });
      it('success - swap performed and then swept with a nice exchange rate', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));
        await uniswap.updateExchangeRate(parseEther('0.3'));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [USDC.address, parseUnits('1', USDCdecimal)],
        );
        const swapData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'uint256', 'bytes'],
          [USDC.address, parseUnits('1', USDCdecimal), 0, '0x'],
        );
        const sweepData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'address'],
          [agEUR.address, parseUnits('0', USDCdecimal), bob.address],
        );
        const dataMixer = [transferData, swapData, sweepData];
        const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.uniswapV3, ActionTypeSidechain.sweep];
        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(uniswap.address)).to.be.equal(parseUnits('1', USDCdecimal));
        expect(await agEUR.balanceOf(bob.address)).to.be.equal(parseEther('0.3'));
        expect(await USDC.allowance(router.address, uniswap.address)).to.be.equal(
          MAX_UINT256.sub(parseUnits('1', USDCdecimal)),
        );
      });
    });
    describe('oneInch', () => {
      it('success - swap successfully performed', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [USDC.address, parseUnits('1', USDCdecimal)],
        );
        const payload1inch = oneInch.interface.encodeFunctionData('swap', [
          ethers.constants.AddressZero,
          {
            srcToken: USDC.address,
            dstToken: agEUR.address,
            srcReceiver: oneInch.address,
            dstReceiver: router.address,
            amount: UNIT_USDC,
            minReturnAmount: BigNumber.from(0),
            flags: BigNumber.from(0),
            permit: '0x',
          },
          '0x',
        ]);
        const swapData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'bytes'],
          [USDC.address, parseUnits('1', USDCdecimal), payload1inch],
        );
        const dataMixer = [transferData, swapData];
        const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.oneInch];
        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(oneInch.address)).to.be.equal(parseUnits('1', USDCdecimal));
        expect(await agEUR.balanceOf(router.address)).to.be.equal(parseEther('1'));
        expect(await USDC.allowance(router.address, oneInch.address)).to.be.equal(
          MAX_UINT256.sub(parseUnits('1', USDCdecimal)),
        );
      });
      it('success - swap successfully performed with exchange rate and sweep', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [USDC.address, parseUnits('1', USDCdecimal)],
        );
        const payload1inch = oneInch.interface.encodeFunctionData('swap', [
          ethers.constants.AddressZero,
          {
            srcToken: USDC.address,
            dstToken: agEUR.address,
            srcReceiver: oneInch.address,
            dstReceiver: router.address,
            amount: UNIT_USDC,
            minReturnAmount: BigNumber.from(0),
            flags: BigNumber.from(0),
            permit: '0x',
          },
          '0x',
        ]);
        const swapData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'bytes'],
          [USDC.address, parseUnits('1', USDCdecimal), payload1inch],
        );
        await oneInch.updateExchangeRate(parseEther('0.3'));
        const sweepData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'address'],
          [agEUR.address, parseUnits('0', USDCdecimal), bob.address],
        );
        const dataMixer = [transferData, swapData, sweepData];
        const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.oneInch, ActionTypeSidechain.sweep];
        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(oneInch.address)).to.be.equal(parseUnits('1', USDCdecimal));
        expect(await agEUR.balanceOf(bob.address)).to.be.equal(parseEther('0.3'));
        expect(await USDC.allowance(router.address, oneInch.address)).to.be.equal(
          MAX_UINT256.sub(parseUnits('1', USDCdecimal)),
        );
      });
      it('success - swap successfully performed with just exchange rate', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [USDC.address, parseUnits('1', USDCdecimal)],
        );
        const payload1inch = oneInch.interface.encodeFunctionData('swap', [
          ethers.constants.AddressZero,
          {
            srcToken: USDC.address,
            dstToken: agEUR.address,
            srcReceiver: oneInch.address,
            dstReceiver: router.address,
            amount: UNIT_USDC,
            minReturnAmount: BigNumber.from(0),
            flags: BigNumber.from(0),
            permit: '0x',
          },
          '0x',
        ]);
        const swapData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'bytes'],
          [USDC.address, parseUnits('0', USDCdecimal), payload1inch],
        );
        await oneInch.updateExchangeRate(parseEther('0.3'));
        const dataMixer = [transferData, swapData];
        const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.oneInch];
        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(oneInch.address)).to.be.equal(parseUnits('1', USDCdecimal));
        expect(await agEUR.balanceOf(router.address)).to.be.equal(parseEther('0.3'));
        expect(await USDC.allowance(router.address, oneInch.address)).to.be.equal(
          MAX_UINT256.sub(parseUnits('1', USDCdecimal)),
        );
      });
      it('reverts - swap successfully performed with just exchange rate but slippage', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [USDC.address, parseUnits('1', USDCdecimal)],
        );
        const payload1inch = oneInch.interface.encodeFunctionData('swap', [
          ethers.constants.AddressZero,
          {
            srcToken: USDC.address,
            dstToken: agEUR.address,
            srcReceiver: oneInch.address,
            dstReceiver: router.address,
            amount: UNIT_USDC,
            minReturnAmount: BigNumber.from(0),
            flags: BigNumber.from(0),
            permit: '0x',
          },
          '0x',
        ]);
        const swapData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'bytes'],
          [USDC.address, parseEther('1'), payload1inch],
        );
        await oneInch.updateExchangeRate(parseEther('0.3'));
        const dataMixer = [transferData, swapData];
        const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.oneInch];
        await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.revertedWith('TooSmallAmountOut');
      });
      it('reverts - swap reverted with no error message', async () => {
        const payload1inch = web3.eth.abi.encodeFunctionCall(
          {
            name: 'revertingSwap2',
            type: 'function',
            inputs: [],
          },
          [],
        );
        const swapData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'bytes'],
          [USDC.address, parseUnits('1', USDCdecimal), payload1inch],
        );
        const actions = [ActionTypeSidechain.oneInch];
        const dataMixer = [swapData];
        await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.revertedWith(
          'InvalidReturnMessage',
        );
      });
      it('reverts - swap reverted with error message', async () => {
        const payload1inch = web3.eth.abi.encodeFunctionCall(
          {
            name: 'revertingSwap',
            type: 'function',
            inputs: [],
          },
          [],
        );
        const swapData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'bytes'],
          [USDC.address, parseUnits('1', USDCdecimal), payload1inch],
        );
        const actions = [ActionTypeSidechain.oneInch];
        const dataMixer = [swapData];
        await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.revertedWith('wrong swap');
      });
    });
  });
});
