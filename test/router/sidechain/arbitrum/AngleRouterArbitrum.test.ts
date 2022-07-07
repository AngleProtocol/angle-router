import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, BytesLike } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import hre, { contract, ethers } from 'hardhat';

import {
  AngleRouterArbitrum,
  AngleRouterArbitrum__factory,
  ERC20,
  ERC20__factory,
  Mock1Inch,
  Mock1Inch__factory,
  MockAgToken,
  MockAgToken__factory,
  MockCoreBorrow,
  MockCoreBorrow__factory,
  MockRouterSidechain,
  MockRouterSidechain__factory,
  MockTokenPermit,
  MockTokenPermit__factory,
  MockUniswapV3Router,
  MockUniswapV3Router__factory,
} from '../../../../typechain';
import { expect } from '../../../../utils/chai-setup';
import { ActionTypeSidechain, TypePermit } from '../../../../utils/helpers';
import { deployUpgradeable, expectApprox, ZERO_ADDRESS } from '../../../utils/helpers';

contract('AngleRouterArbitrum', () => {
  let deployer: SignerWithAddress;
  let USDC: MockTokenPermit;
  let agEUR: MockAgToken;
  let wETH: ERC20;
  let core: MockCoreBorrow;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let uniswap: MockUniswapV3Router;
  let oneInch: Mock1Inch;
  let router: AngleRouterArbitrum;
  let USDCdecimal: BigNumber;
  let permits: TypePermit[];

  before(async () => {
    ({ deployer, alice, bob } = await ethers.getNamedSigners());
    USDCdecimal = BigNumber.from('6');
    wETH = (await ethers.getContractAt(ERC20__factory.abi, '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1')) as ERC20;

    permits = [];
  });

  beforeEach(async () => {
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.ETH_NODE_URI_ARBITRUM,
            // Changing Arbitrum fork block breaks some tests
            blockNumber: 16027942,
          },
        },
      ],
    });
    await hre.network.provider.send('hardhat_setBalance', [alice.address, '0x10000000000000000000000000000']);
    // If the forked-network state needs to be reset between each test, run this
    router = (await deployUpgradeable(new AngleRouterArbitrum__factory(deployer))) as AngleRouterArbitrum;
    USDC = (await new MockTokenPermit__factory(deployer).deploy('USDC', 'USDC', USDCdecimal)) as MockTokenPermit;
    agEUR = (await deployUpgradeable(new MockAgToken__factory(deployer))) as MockAgToken;
    await agEUR.initialize('agEUR', 'agEUR', ZERO_ADDRESS, ZERO_ADDRESS);
    uniswap = (await new MockUniswapV3Router__factory(deployer).deploy(
      USDC.address,
      agEUR.address,
    )) as MockUniswapV3Router;
    oneInch = (await new Mock1Inch__factory(deployer).deploy(USDC.address, agEUR.address)) as Mock1Inch;
    core = (await new MockCoreBorrow__factory(deployer).deploy()) as MockCoreBorrow;
    await core.toggleGovernor(alice.address);
    await core.toggleGuardian(alice.address);
    await core.toggleGuardian(bob.address);
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
  describe('mixer', () => {
    describe('sweepNative', () => {
      it('success - amount transferred to the vault', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [USDC.address, parseUnits('0.3', USDCdecimal)],
        );
        const actions = [ActionTypeSidechain.transfer];
        const dataMixer = [transferData];

        await router.connect(alice).mixer(permits, actions, dataMixer, { value: parseEther('1') });

        const actions2 = [ActionTypeSidechain.sweepNative];
        const balance = await ethers.provider.getBalance(alice.address);
        await router.connect(alice).mixer(permits, actions2, []);
        expectApprox((await ethers.provider.getBalance(alice.address)).sub(balance), parseEther('1'), 0.1);
      });
      it('success - when there is no ETH balance', async () => {
        const actions = [ActionTypeSidechain.sweepNative];
        const balance = await ethers.provider.getBalance(alice.address);
        await router.connect(alice).mixer(permits, actions, []);
        expectApprox(await ethers.provider.getBalance(alice.address), balance, 0.1);
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
    describe('wrapNative', () => {
      it('success - when there is nothing in the action', async () => {
        const actions = [ActionTypeSidechain.wrapNative];
        const dataMixer: BytesLike[] = [];
        await router.connect(alice).mixer(permits, actions, dataMixer, { value: parseEther('1') });
        expect(await wETH.balanceOf(router.address)).to.be.equal(parseEther('1'));
      });
    });
    describe('unwrapNative', () => {
      it('success - when there are no wETH', async () => {
        const actions = [ActionTypeSidechain.unwrapNative];
        const unwrapData = ethers.utils.defaultAbiCoder.encode(['uint256', 'address'], [0, bob.address]);
        await router.connect(alice).mixer(permits, actions, [unwrapData]);
        expect(await wETH.balanceOf(router.address)).to.be.equal(parseEther('0'));
        expect(await wETH.balanceOf(bob.address)).to.be.equal(parseEther('0'));
      });
      it('reverts - because of slippage wETH', async () => {
        const actions = [ActionTypeSidechain.unwrapNative];
        const unwrapData = ethers.utils.defaultAbiCoder.encode(['uint256', 'address'], [parseEther('1'), bob.address]);
        await expect(router.connect(alice).mixer(permits, actions, [unwrapData])).to.be.revertedWith(
          'TooSmallAmountOut',
        );
      });
      it('success - when there are some wETH', async () => {
        const actions = [ActionTypeSidechain.wrapNative];
        const dataMixer: BytesLike[] = [];
        await router.connect(alice).mixer(permits, actions, dataMixer, { value: parseEther('1') });
        expect(await wETH.balanceOf(router.address)).to.be.equal(parseEther('1'));
        const actions2 = [ActionTypeSidechain.unwrapNative];
        const unwrapData = ethers.utils.defaultAbiCoder.encode(['uint256', 'address'], [0, bob.address]);
        const balance = await ethers.provider.getBalance(bob.address);
        await router.connect(alice).mixer(permits, actions2, [unwrapData]);
        expect(await wETH.balanceOf(router.address)).to.be.equal(parseEther('0'));
        expect(await wETH.balanceOf(bob.address)).to.be.equal(parseEther('0'));
        expect(await ethers.provider.getBalance(bob.address)).to.be.equal(parseEther('1').add(balance));
      });
    });
  });
});
