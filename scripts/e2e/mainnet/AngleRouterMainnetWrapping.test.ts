import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BytesLike } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import hre, { contract, ethers } from 'hardhat';

import {
  AngleRouterMainnet,
  AngleRouterMainnet__factory,
  ERC20,
  ERC20__factory,
  MockCoreBorrow,
  MockCoreBorrow__factory,
  MockTokenPermit,
  MockTokenPermit__factory,
} from '../../../typechain';
import { expect } from '../../../utils/chai-setup';
import { ActionType, TypePermit } from '../../../utils/helpers';
import { deployUpgradeable, expectApprox } from '../../../test/hardhat/utils/helpers';

contract('AngleRouterMainnet - Wrapping logic', () => {
  let deployer: SignerWithAddress;
  let USDC: MockTokenPermit;
  let wETH: ERC20;
  let core: MockCoreBorrow;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let router: AngleRouterMainnet;
  let permits: TypePermit[];

  before(async () => {
    ({ deployer, alice, bob } = await ethers.getNamedSigners());
    wETH = (await ethers.getContractAt(ERC20__factory.abi, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2')) as ERC20;

    permits = [];
  });

  beforeEach(async () => {
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.ETH_NODE_URI_MAINNET,
            // Changing Ethereum fork block breaks some tests
            blockNumber: 15983159,
          },
        },
      ],
    });
    await hre.network.provider.send('hardhat_setBalance', [alice.address, '0x10000000000000000000000000000']);
    // If the forked-network state needs to be reset between each test, run this
    router = (await deployUpgradeable(new AngleRouterMainnet__factory(deployer))) as AngleRouterMainnet;
    USDC = (await new MockTokenPermit__factory(deployer).deploy('USDC', 'USDC', 6)) as MockTokenPermit;
    core = (await new MockCoreBorrow__factory(deployer).deploy()) as MockCoreBorrow;
    await core.toggleGovernor(alice.address);
    await core.toggleGuardian(alice.address);
    await core.toggleGuardian(bob.address);
  });

  describe('mixer', () => {
    describe('sweepNative', () => {
      it('success - amount transferred to the vault', async () => {
        await USDC.mint(alice.address, parseUnits('1', 6));
        await USDC.connect(alice).approve(router.address, parseUnits('1', 6));

        const transferData = ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [USDC.address, router.address, parseUnits('0.3', 6)],
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
        expect(await wETH.balanceOf(router.address)).to.be.equal(parseEther('1'));
      });
    });
    describe('unwrapNative', () => {
      it('success - when there are no wETH', async () => {
        const actions = [ActionType.unwrapNative];
        const unwrapData = ethers.utils.defaultAbiCoder.encode(['uint256', 'address'], [0, bob.address]);
        await router.connect(alice).mixer(permits, actions, [unwrapData]);
        expect(await wETH.balanceOf(router.address)).to.be.equal(parseEther('0'));
        expect(await wETH.balanceOf(bob.address)).to.be.equal(parseEther('0'));
      });
      it('reverts - because of slippage wETH', async () => {
        const actions = [ActionType.unwrapNative];
        const unwrapData = ethers.utils.defaultAbiCoder.encode(['uint256', 'address'], [parseEther('1'), bob.address]);
        await expect(router.connect(alice).mixer(permits, actions, [unwrapData])).to.be.revertedWith(
          'TooSmallAmountOut',
        );
      });
      it('success - when there are some wETH', async () => {
        const actions = [ActionType.wrapNative];
        const dataMixer: BytesLike[] = [];
        await router.connect(alice).mixer(permits, actions, dataMixer, { value: parseEther('1') });
        expect(await wETH.balanceOf(router.address)).to.be.equal(parseEther('1'));
        const actions2 = [ActionType.unwrapNative];
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
