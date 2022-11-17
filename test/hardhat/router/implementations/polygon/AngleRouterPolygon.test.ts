import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, BytesLike } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import hre, { contract, ethers } from 'hardhat';

import {
  AngleRouterPolygon,
  AngleRouterPolygon__factory,
  ERC20,
  ERC20__factory,
  Mock1Inch,
  Mock1Inch__factory,
  MockAgToken,
  MockAgToken__factory,
  MockCoreBorrow,
  MockCoreBorrow__factory,
  MockTokenPermit,
  MockTokenPermit__factory,
  MockUniswapV3Router,
  MockUniswapV3Router__factory,
} from '../../../../../typechain';
import { expect } from '../../../../../utils/chai-setup';
import { ActionType, TypePermit } from '../../../../../utils/helpers';
import { deployUpgradeable, expectApprox, ZERO_ADDRESS } from '../../../utils/helpers';

contract('AngleRouterPolygon', () => {
  let deployer: SignerWithAddress;
  let USDC: MockTokenPermit;
  let agEUR: MockAgToken;
  let wMATIC: ERC20;
  let core: MockCoreBorrow;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let uniswap: MockUniswapV3Router;
  let oneInch: Mock1Inch;
  let router: AngleRouterPolygon;
  let USDCdecimal: BigNumber;
  let permits: TypePermit[];

  before(async () => {
    ({ deployer, alice, bob } = await ethers.getNamedSigners());
    USDCdecimal = BigNumber.from('6');
    wMATIC = (await ethers.getContractAt(ERC20__factory.abi, '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270')) as ERC20;

    permits = [];
  });

  beforeEach(async () => {
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.ETH_NODE_URI_FORKPOLYGON,
            // Changing Polygon fork block breaks some tests
            blockNumber: 29902016,
          },
        },
      ],
    });
    await hre.network.provider.send('hardhat_setBalance', [alice.address, '0x10000000000000000000000000000']);
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
    await core.toggleGovernor(alice.address);
    await core.toggleGuardian(alice.address);
    await core.toggleGuardian(bob.address);
    await router.initializeRouter(core.address, uniswap.address, oneInch.address);
  });

  describe('mixer', () => {
    describe('sweepNative', () => {
      it('success - amount transferred to the vault', async () => {
        await USDC.mint(alice.address, parseUnits('1', USDCdecimal));
        await USDC.connect(alice).approve(router.address, parseUnits('1', USDCdecimal));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [USDC.address, router.address, parseUnits('0.3', USDCdecimal)],
        );
        const actions = [ActionType.transfer];
        const dataMixer = [transferData];

        await router.connect(alice).mixer(permits, actions, dataMixer, { value: parseEther('1') });

        const actions2 = [ActionType.sweepNative];
        const balance = await ethers.provider.getBalance(alice.address);
        await router.connect(alice).mixer(permits, actions2, []);
        expectApprox((await ethers.provider.getBalance(alice.address)).sub(balance), parseEther('1'), 0.1);
      });
      it('success - when there is no ETH balance', async () => {
        const actions = [ActionType.sweepNative];
        const balance = await ethers.provider.getBalance(alice.address);
        await router.connect(alice).mixer(permits, actions, []);
        expectApprox(await ethers.provider.getBalance(alice.address), balance, 0.1);
      });
    });
    describe('wrapNative', () => {
      it('success - when there is nothing in the action', async () => {
        const actions = [ActionType.wrapNative];
        const dataMixer: BytesLike[] = [];
        await router.connect(alice).mixer(permits, actions, dataMixer, { value: parseEther('1') });
        expect(await wMATIC.balanceOf(router.address)).to.be.equal(parseEther('1'));
      });
    });
    describe('unwrapNative', () => {
      it('success - when there are no wMATIC', async () => {
        const actions = [ActionType.unwrapNative];
        const unwrapData = ethers.utils.defaultAbiCoder.encode(['uint256', 'address'], [0, bob.address]);
        await router.connect(alice).mixer(permits, actions, [unwrapData]);
        expect(await wMATIC.balanceOf(router.address)).to.be.equal(parseEther('0'));
        expect(await wMATIC.balanceOf(bob.address)).to.be.equal(parseEther('0'));
      });
      it('reverts - because of slippage wMATIC', async () => {
        const actions = [ActionType.unwrapNative];
        const unwrapData = ethers.utils.defaultAbiCoder.encode(['uint256', 'address'], [parseEther('1'), bob.address]);
        await expect(router.connect(alice).mixer(permits, actions, [unwrapData])).to.be.revertedWith(
          'TooSmallAmountOut',
        );
      });
      it('success - when there are some wMATIC', async () => {
        const actions = [ActionType.wrapNative];
        const dataMixer: BytesLike[] = [];
        await router.connect(alice).mixer(permits, actions, dataMixer, { value: parseEther('1') });
        expect(await wMATIC.balanceOf(router.address)).to.be.equal(parseEther('1'));
        const actions2 = [ActionType.unwrapNative];
        const unwrapData = ethers.utils.defaultAbiCoder.encode(['uint256', 'address'], [0, bob.address]);
        const balance = await ethers.provider.getBalance(bob.address);
        await router.connect(alice).mixer(permits, actions2, [unwrapData]);
        expect(await wMATIC.balanceOf(router.address)).to.be.equal(parseEther('0'));
        expect(await wMATIC.balanceOf(bob.address)).to.be.equal(parseEther('0'));
        expect(await ethers.provider.getBalance(bob.address)).to.be.equal(parseEther('1').add(balance));
      });
    });
  });
});
