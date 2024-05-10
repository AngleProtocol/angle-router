import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, BytesLike, Signer } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import hre, { contract, ethers, web3 } from 'hardhat';

import {
  Mock1Inch,
  Mock1Inch__factory,
  MockAgToken,
  MockAgToken__factory,
  MockBorrowStaker,
  MockBorrowStaker__factory,
  MockCoreBorrow,
  MockCoreBorrow__factory,
  MockLiquidityGauge,
  MockLiquidityGauge__factory,
  MockRouterSidechain,
  MockRouterSidechain__factory,
  MockSwapper,
  MockSwapper__factory,
  MockTokenPermit,
  MockTokenPermit__factory,
  MockUniswapV3Router,
  MockUniswapV3Router__factory,
} from '../../../typechain';
import { expect } from '../../../utils/chai-setup';
import { ActionType, TypePermit } from '../../../utils/helpers';
import { signPermit } from '../../../utils/sign';
import { deployUpgradeable, MAX_UINT256, ZERO_ADDRESS } from '../utils/helpers';

contract('BaseRouter', () => {
  // As a proxy for the BaseRouter we're using a mock Ethereum implementation of it
  let deployer: SignerWithAddress;
  let USDC: MockTokenPermit;
  let agEUR: MockAgToken;
  let core: MockCoreBorrow;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let uniswap: MockUniswapV3Router;
  let oneInch: Mock1Inch;
  let router: MockRouterSidechain;
  let swapper: MockSwapper;
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
    swapper = (await new MockSwapper__factory(deployer).deploy()) as MockSwapper;
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
      await (await router.connect(impersonatedSigners[governor]).setCore(core2.address)).wait();
      expect(await router.core()).to.be.equal(core2.address);
    });
  });

  describe('setRouter', () => {
    it('reverts - non governor nor guardian or zero address', async () => {
      await expect(router.connect(deployer).setRouter(bob.address, 0)).to.be.revertedWith('NotGovernorOrGuardian');
      await expect(router.connect(impersonatedSigners[governor]).setRouter(ZERO_ADDRESS, 0)).to.be.revertedWith(
        'ZeroAddress',
      );
    });
    it('success - addresses updated', async () => {
      await router.connect(impersonatedSigners[governor]).setRouter(bob.address, 0);
      expect(await router.uniswapV3Router()).to.be.equal(bob.address);
      await router.connect(impersonatedSigners[governor]).setRouter(alice.address, 1);
      expect(await router.oneInch()).to.be.equal(alice.address);
    });
  });
  describe('mixer', () => {
    describe('transfer', () => {
      it('success - amount transferred to the vault', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [USDC.address, router.address, parseUnits('0.3', USDCdecimal)],
        );
        const actions = [ActionType.transfer];
        const dataMixer = [transferData];

        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0.7', USDCdecimal));
        expect(await USDC.balanceOf(router.address)).to.be.equal(parseUnits('0.3', USDCdecimal));
      });
      it('success - amount transferred to the vault and unsupported action', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [USDC.address, router.address, parseUnits('0.3', USDCdecimal)],
        );
        const actions = [ActionType.transfer, ActionType.veANGLEDeposit];
        const dataMixer = [transferData, transferData];

        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0.7', USDCdecimal));
        expect(await USDC.balanceOf(router.address)).to.be.equal(parseUnits('0.3', USDCdecimal));
      });
      it('success - amount transferred to the vault with a permit before', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        const permits2: TypePermit[] = [
          await signPermit(
            alice,
            (await USDC.nonces(alice.address)).toNumber(),
            USDC.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
            router.address,
            MAX_UINT256,
            'USDC',
          ),
        ];

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [USDC.address, router.address, parseUnits('0.3', USDCdecimal)],
        );
        const actions = [ActionType.transfer];
        const dataMixer = [transferData];

        await router.connect(alice).mixer(permits2, actions, dataMixer);
        expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0.7', USDCdecimal));
        expect(await USDC.balanceOf(router.address)).to.be.equal(parseUnits('0.3', USDCdecimal));
      });
      it('reverts - permit with invalid deadline', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        const permits2: TypePermit[] = [
          await signPermit(
            alice,
            (await USDC.nonces(alice.address)).toNumber(),
            USDC.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) - 1000,
            router.address,
            MAX_UINT256,
            'USDC',
          ),
        ];

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [USDC.address, router.address, parseUnits('0.3', USDCdecimal)],
        );
        const actions = [ActionType.transfer];
        const dataMixer = [transferData];

        await expect(router.connect(alice).mixer(permits2, actions, dataMixer)).to.be.reverted;
      });
      it('success - several permits and several transfers', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await agEUR.mint(alice.address, parseEther('3'));
        const permits2: TypePermit[] = [
          await signPermit(
            alice,
            (await USDC.nonces(alice.address)).toNumber(),
            USDC.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
            router.address,
            MAX_UINT256,
            'USDC',
          ),
          await signPermit(
            alice,
            (await agEUR.nonces(alice.address)).toNumber(),
            agEUR.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
            router.address,
            parseEther('1.3'),
            'agEUR',
          ),
        ];

        const transferData0 = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [USDC.address, router.address, parseUnits('0.3', USDCdecimal)],
        );
        const transferData1 = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [agEUR.address, bob.address, parseEther('1.2')],
        );
        const actions = [ActionType.transfer, ActionType.transfer];
        const dataMixer = [transferData0, transferData1];

        await router.connect(alice).mixer(permits2, actions, dataMixer);

        expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0.7', USDCdecimal));
        expect(await USDC.balanceOf(router.address)).to.be.equal(parseUnits('0.3', USDCdecimal));
        expect(await agEUR.balanceOf(alice.address)).to.be.equal(parseEther('1.8'));
        expect(await agEUR.balanceOf(bob.address)).to.be.equal(parseEther('1.2'));
        expect(await agEUR.allowance(alice.address, router.address)).to.be.equal(parseEther('0.1'));
      });
      it('success - amount transferred to the vault and then swept', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [USDC.address, router.address, parseUnits('0.3', USDCdecimal)],
        );

        const sweepData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'address'],
          [USDC.address, parseUnits('0', USDCdecimal), bob.address],
        );
        const actions = [ActionType.transfer, ActionType.sweep];
        const dataMixer = [transferData, sweepData];

        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0.7', USDCdecimal));
        expect(await USDC.balanceOf(router.address)).to.be.equal(parseUnits('0', USDCdecimal));
        expect(await USDC.balanceOf(bob.address)).to.be.equal(parseUnits('0.3', USDCdecimal));
      });
      it('success - max uint is transferred but only balance is taken', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [USDC.address, router.address, MAX_UINT256],
        );

        const actions = [ActionType.transfer];
        const dataMixer = [transferData];

        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0', USDCdecimal));
        expect(await USDC.balanceOf(router.address)).to.be.equal(parseUnits('1', USDCdecimal));
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
        const actions = [ActionType.sweep];
        const dataMixer = [sweepData];
        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      });
      it('success - after a transfer', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [USDC.address, router.address, parseUnits('0.3', USDCdecimal)],
        );
        const actions = [ActionType.transfer];
        const dataMixer = [transferData];

        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0.7', USDCdecimal));
        expect(await USDC.balanceOf(router.address)).to.be.equal(parseUnits('0.3', USDCdecimal));

        const sweepData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'address'],
          [USDC.address, parseUnits('0', USDCdecimal), bob.address],
        );
        const actions2 = [ActionType.sweep];
        const dataMixer2 = [sweepData];
        await router.connect(alice).mixer(permits, actions2, dataMixer2);
        expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0.7', USDCdecimal));
        expect(await USDC.balanceOf(bob.address)).to.be.equal(parseUnits('0.3', USDCdecimal));
      });
      it('reverts - when slippage', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [USDC.address, router.address, parseUnits('0.3', USDCdecimal)],
        );
        const actions = [ActionType.transfer];
        const dataMixer = [transferData];

        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0.7', USDCdecimal));
        expect(await USDC.balanceOf(router.address)).to.be.equal(parseUnits('0.3', USDCdecimal));

        const sweepData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'address'],
          [USDC.address, parseUnits('1', USDCdecimal), bob.address],
        );
        const actions2 = [ActionType.sweep];
        const dataMixer2 = [sweepData];
        await expect(router.connect(alice).mixer(permits, actions2, dataMixer2)).to.be.revertedWith(
          'TooSmallAmountOut',
        );
      });
    });
    describe('wrapNative', () => {
      it('success - when there is nothing in the action', async () => {
        const actions = [ActionType.wrapNative];
        const dataMixer: BytesLike[] = [];
        await router.connect(alice).mixer(permits, actions, dataMixer);
      });
    });
    describe('unwrapNative', () => {
      it('success - when there is nothing in the action', async () => {
        const actions = [ActionType.unwrapNative];
        const wrapData = ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'address'],
          [parseUnits('0.3', USDCdecimal), bob.address],
        );
        const dataMixer = [wrapData];
        await router.connect(alice).mixer(permits, actions, dataMixer);
      });
    });
    describe('swapper', () => {
      it('reverts - when not enough balance', async () => {
        const actions = [ActionType.swapper];
        const swapperData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'address', 'address', 'uint256', 'uint256', 'bytes'],
          [swapper.address, USDC.address, agEUR.address, bob.address, parseEther('1'), parseUnits('1', 6), '0x'],
        );
        const dataMixer = [swapperData];
        await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.reverted;
        await router
          .connect(impersonatedSigners[governor])
          .changeAllowance([USDC.address], [swapper.address], [MAX_UINT256]);
        await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.reverted;
      });
      it('success - when enough balance', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));
        await agEUR.mint(swapper.address, parseEther('1'));
        await router
          .connect(impersonatedSigners[governor])
          .changeAllowance([USDC.address], [swapper.address], [MAX_UINT256]);
        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [USDC.address, router.address, parseUnits('1', USDCdecimal)],
        );

        const swapperData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'address', 'address', 'uint256', 'uint256', 'bytes'],
          [swapper.address, USDC.address, agEUR.address, bob.address, parseEther('1'), parseUnits('1', 6), '0x'],
        );
        const actions = [ActionType.transfer, ActionType.swapper];
        const dataMixer = [transferData, swapperData];
        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(swapper.address)).to.be.equal(parseUnits('1', 6));
        expect(await agEUR.balanceOf(bob.address)).to.be.equal(parseEther('1'));
      });
    });
    describe('claimRewards', () => {
      it('success - claiming rewards from a gauge', async () => {
        const gauge = (await new MockLiquidityGauge__factory(deployer).deploy(USDC.address)) as MockLiquidityGauge;
        const claimData = ethers.utils.defaultAbiCoder.encode(['address', 'address[]'], [bob.address, [gauge.address]]);
        const actions = [ActionType.claimRewards];
        const dataMixer = [claimData];
        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await gauge.counter(bob.address)).to.be.equal(1);
      });
      it('success - claiming rewards from two gauges with different interfaces and return values', async () => {
        const gauge = (await new MockLiquidityGauge__factory(deployer).deploy(USDC.address)) as MockLiquidityGauge;
        const staker = (await new MockBorrowStaker__factory(deployer).deploy()) as MockBorrowStaker;
        const claimData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address[]'],
          [bob.address, [gauge.address, staker.address, staker.address]],
        );
        const actions = [ActionType.claimRewards];
        const dataMixer = [claimData];
        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await gauge.counter(bob.address)).to.be.equal(1);
        expect(await staker.counter(bob.address)).to.be.equal(2);
      });
      it('reverts - when gauge address is invalid', async () => {
        const claimData = ethers.utils.defaultAbiCoder.encode(['address', 'address[]'], [bob.address, [bob.address]]);
        const actions = [ActionType.claimRewards];
        const dataMixer = [claimData];
        await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.reverted;
      });
    });

    describe('oneInch', () => {
      it('success - swap successfully performed', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [USDC.address, router.address, parseUnits('1', USDCdecimal)],
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
        const actions = [ActionType.transfer, ActionType.oneInch];
        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(oneInch.address)).to.be.equal(parseUnits('1', USDCdecimal));
        expect(await agEUR.balanceOf(router.address)).to.be.equal(parseEther('1'));
        expect(await USDC.allowance(router.address, oneInch.address)).to.be.equal(MAX_UINT256);
      });
      it('success - swap successfully performed with exchange rate and sweep', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [USDC.address, router.address, parseUnits('1', USDCdecimal)],
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
        const actions = [ActionType.transfer, ActionType.oneInch, ActionType.sweep];
        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(oneInch.address)).to.be.equal(parseUnits('1', USDCdecimal));
        expect(await agEUR.balanceOf(bob.address)).to.be.equal(parseEther('0.3'));
        expect(await USDC.allowance(router.address, oneInch.address)).to.be.equal(MAX_UINT256);
      });
      it('success - swap successfully performed with just exchange rate', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [USDC.address, router.address, parseUnits('1', USDCdecimal)],
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
        const actions = [ActionType.transfer, ActionType.oneInch];
        await router.connect(alice).mixer(permits, actions, dataMixer);
        expect(await USDC.balanceOf(oneInch.address)).to.be.equal(parseUnits('1', USDCdecimal));
        expect(await agEUR.balanceOf(router.address)).to.be.equal(parseEther('0.3'));
        expect(await USDC.allowance(router.address, oneInch.address)).to.be.equal(MAX_UINT256);
      });
      it('reverts - swap successfully performed with just exchange rate but slippage', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [USDC.address, router.address, parseUnits('1', USDCdecimal)],
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
        const actions = [ActionType.transfer, ActionType.oneInch];
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
        const actions = [ActionType.oneInch];
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
        const actions = [ActionType.oneInch];
        const dataMixer = [swapData];
        await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.revertedWith('wrong swap');
      });
    });
    describe('chainSpecificAction', () => {
      it('success - call on a chain specific action has no effect', async () => {
        const actions = [ActionType.claimRewardsWithPerps];
        const actionData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'address', 'bool'],
          [bob.address, 1, ZERO_ADDRESS, true],
        );
        const dataMixer = [actionData];
        await router.connect(alice).mixer(permits, actions, dataMixer);
      });
    });
  });
});
