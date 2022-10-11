import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, Signer } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import hre, { contract, ethers, web3 } from 'hardhat';

import {
  AngleRouter,
  AngleRouter__factory,
  MockERC4626,
  MockERC4626__factory,
  MockTokenPermit,
  MockTokenPermit__factory,
} from '../../../typechain';
import { expect } from '../../../utils/chai-setup';
import { ActionType, TypePermit, TypeSwap, TypeTransfer } from '../../../utils/helpers';
import { signPermit } from '../../../utils/sign';
import { deployUpgradeable } from '../utils/helpers';

contract('Router - ERC4626 Functionalities', () => {
  let deployer: SignerWithAddress;
  let USDC: MockTokenPermit;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let strat: MockERC4626;
  let router: AngleRouter;
  let UNIT_USDC: BigNumber;
  let UNIT_DAI: BigNumber;
  let USDCdecimal: BigNumber;
  let DAIdecimal: BigNumber;

  const impersonatedSigners: { [key: string]: Signer } = {};

  before(async () => {
    ({ deployer, alice, bob } = await ethers.getNamedSigners());
    // add any addresses you want to impersonate here
    const impersonatedAddresses = [{ address: '0xdC4e6DFe07EFCa50a197DF15D9200883eF4Eb1c8', name: 'governor' }];

    for (const ob of impersonatedAddresses) {
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ob.address],
      });

      await hre.network.provider.send('hardhat_setBalance', [ob.address, '0x10000000000000000000000000000']);

      impersonatedSigners[ob.name] = await ethers.getSigner(ob.address);
      USDCdecimal = BigNumber.from('6');
      DAIdecimal = BigNumber.from('18');

      UNIT_USDC = BigNumber.from(10).pow(USDCdecimal);
      UNIT_DAI = BigNumber.from(10).pow(DAIdecimal);
    }
  });

  beforeEach(async () => {
    // If the forked-network state needs to be reset between each test, run this
    // await network.provider.request({method: 'hardhat_reset', params: []});
    router = (await deployUpgradeable(new AngleRouter__factory(deployer))) as AngleRouter;
    USDC = (await new MockTokenPermit__factory(deployer).deploy('USDC', 'USDC', USDCdecimal)) as MockTokenPermit;
    strat = (await new MockERC4626__factory(deployer).deploy(USDC.address, 'testsr', 'testsr')) as MockERC4626;
    await USDC.mint(alice.address, parseUnits('1000', 6));
  });

  describe('mixer - mint', () => {
    it('success - shares minted to the to address - when there are no shares', async () => {
      const permits: TypePermit[] = [
        await signPermit(
          alice,
          (await USDC.nonces(alice.address)).toNumber(),
          USDC.address,
          Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
          router.address,
          UNIT_DAI,
          'USDC',
        ),
      ];
      const transfers: TypeTransfer[] = [
        { inToken: USDC.address, receiver: router.address, amountIn: UNIT_USDC.mul(1) },
      ];
      const swaps: TypeSwap[] = [];

      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseEther('1'), bob.address, parseEther('100')],
      );

      const actions = [ActionType.mintSavingsRate];
      const dataMixer = [mintData];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);

      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('999', 6));
      expect(await strat.balanceOf(bob.address)).to.be.equal(parseEther('1'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('1'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(0);
    });
    it('success - shares minted to the router and then sent to the msg sender', async () => {
      const permits: TypePermit[] = [
        await signPermit(
          alice,
          (await USDC.nonces(alice.address)).toNumber(),
          USDC.address,
          Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
          router.address,
          UNIT_DAI,
          'USDC',
        ),
      ];
      const transfers: TypeTransfer[] = [
        { inToken: USDC.address, receiver: router.address, amountIn: UNIT_USDC.mul(1) },
      ];
      const swaps: TypeSwap[] = [];

      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseEther('1'), router.address, parseEther('100')],
      );

      const actions = [ActionType.mintSavingsRate];
      const dataMixer = [mintData];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);

      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('999', 6));
      expect(await strat.balanceOf(alice.address)).to.be.equal(parseEther('1'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('1'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(0);
    });
    it('reverts - too small amount out', async () => {
      const permits: TypePermit[] = [
        await signPermit(
          alice,
          (await USDC.nonces(alice.address)).toNumber(),
          USDC.address,
          Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
          router.address,
          UNIT_DAI,
          'USDC',
        ),
      ];
      const transfers: TypeTransfer[] = [
        { inToken: USDC.address, receiver: router.address, amountIn: UNIT_USDC.mul(1) },
      ];
      const swaps: TypeSwap[] = [];

      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseEther('1'), router.address, parseEther('0')],
      );

      const actions = [ActionType.mintSavingsRate];
      const dataMixer = [mintData];
      await expect(router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer)).to.be.reverted;
    });
  });
  describe('mixer - deposit', () => {
    it('success - shares minted to the to address - when there are no shares', async () => {
      const permits: TypePermit[] = [
        await signPermit(
          alice,
          (await USDC.nonces(alice.address)).toNumber(),
          USDC.address,
          Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
          router.address,
          UNIT_DAI,
          'USDC',
        ),
      ];
      const transfers: TypeTransfer[] = [
        { inToken: USDC.address, receiver: router.address, amountIn: UNIT_USDC.mul(1) },
      ];
      const swaps: TypeSwap[] = [];
      // Specifying a full proportion
      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseUnits('1', 9), bob.address, parseEther('0')],
      );

      const actions = [ActionType.depositSavingsRate];
      const dataMixer = [mintData];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);

      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('999', 6));
      expect(await strat.balanceOf(bob.address)).to.be.equal(parseEther('1'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('1'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(0);
    });
    it('success - shares minted to the router and then sent to the msg sender', async () => {
      const permits: TypePermit[] = [
        await signPermit(
          alice,
          (await USDC.nonces(alice.address)).toNumber(),
          USDC.address,
          Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
          router.address,
          UNIT_DAI,
          'USDC',
        ),
      ];
      const transfers: TypeTransfer[] = [
        { inToken: USDC.address, receiver: router.address, amountIn: UNIT_USDC.mul(1) },
      ];
      const swaps: TypeSwap[] = [];

      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseUnits('1', 9), router.address, parseEther('0')],
      );

      const actions = [ActionType.depositSavingsRate];
      const dataMixer = [mintData];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);

      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('999', 6));
      expect(await strat.balanceOf(alice.address)).to.be.equal(parseEther('1'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('1'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(0);
    });
    it('reverts - too small amount out', async () => {
      const permits: TypePermit[] = [
        await signPermit(
          alice,
          (await USDC.nonces(alice.address)).toNumber(),
          USDC.address,
          Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
          router.address,
          UNIT_DAI,
          'USDC',
        ),
      ];
      const transfers: TypeTransfer[] = [
        { inToken: USDC.address, receiver: router.address, amountIn: UNIT_USDC.mul(1) },
      ];
      const swaps: TypeSwap[] = [];

      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseUnits('1', 9), router.address, parseEther('1000')],
      );

      const actions = [ActionType.depositSavingsRate];
      const dataMixer = [mintData];
      await expect(router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer)).to.be.revertedWith(
        'TooSmallAmountOut',
      );
    });
  });

  describe('mixer - redeem', () => {
    it('success - redemption happens well', async () => {
      await USDC.connect(alice).approve(strat.address, parseUnits('1000', 6));
      await strat.connect(alice).mint(parseEther('1000'), alice.address);
      await strat.connect(alice).approve(router.address, parseEther('1000'));
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseEther('1'), bob.address, parseUnits('0', 6)],
      );

      const actions = [ActionType.redeemSavingsRate];
      const dataMixer = [redeemData];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(parseUnits('1', 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0', 6));
      expect(await strat.balanceOf(alice.address)).to.be.equal(parseEther('999'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('999'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(0);
    });
    it('success - redemption happens well when done through the router', async () => {
      await USDC.connect(alice).approve(strat.address, parseUnits('1000', 6));
      await strat.connect(alice).mint(parseEther('1000'), alice.address);
      await strat.connect(alice).approve(router.address, parseEther('1000'));
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseEther('1'), router.address, parseUnits('0', 6)],
      );

      const actions = [ActionType.redeemSavingsRate];
      const dataMixer = [redeemData];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('1', 6));
      expect(await strat.balanceOf(alice.address)).to.be.equal(parseEther('999'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('999'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(0);
    });
    it('reverts - when there not enough is obtained', async () => {
      await USDC.connect(alice).approve(strat.address, parseUnits('1000', 6));
      await strat.connect(alice).mint(parseEther('1000'), alice.address);
      await strat.connect(alice).approve(router.address, parseEther('1000'));
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseEther('1'), bob.address, parseUnits('1000000', 6)],
      );
      const actions = [ActionType.redeemSavingsRate];
      const dataMixer = [redeemData];
      await expect(router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer)).to.be.revertedWith(
        'TooSmallAmountOut',
      );
    });
  });
  describe('mixer - withdraw', () => {
    it('success - withdrawal happens well', async () => {
      await USDC.connect(alice).approve(strat.address, parseUnits('1000', 6));
      await strat.connect(alice).mint(parseEther('1000'), alice.address);
      await strat.connect(alice).approve(router.address, parseEther('1000'));
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseUnits('1', 6), bob.address, parseEther('10')],
      );

      const actions = [ActionType.withdrawSavingsRate];
      const dataMixer = [redeemData];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(parseUnits('1', 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('0', 6));
      expect(await strat.balanceOf(alice.address)).to.be.equal(parseEther('999'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('999'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(0);
    });
    it('success - redemption happens well when done through the router', async () => {
      await USDC.connect(alice).approve(strat.address, parseUnits('1000', 6));
      await strat.connect(alice).mint(parseEther('1000'), alice.address);
      await strat.connect(alice).approve(router.address, parseEther('1000'));
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseUnits('1', 6), router.address, parseEther('100')],
      );

      const actions = [ActionType.withdrawSavingsRate];
      const dataMixer = [redeemData];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('1', 6));
      expect(await strat.balanceOf(alice.address)).to.be.equal(parseEther('999'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('999'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(0);
    });
    it('reverts - when there not enough is obtained', async () => {
      await USDC.connect(alice).approve(strat.address, parseUnits('1000', 6));
      await strat.connect(alice).mint(parseEther('1000'), alice.address);
      await strat.connect(alice).approve(router.address, parseEther('1000'));
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseUnits('1', 6), bob.address, parseEther('0')],
      );
      const actions = [ActionType.withdrawSavingsRate];
      const dataMixer = [redeemData];
      await expect(router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer)).to.be.revertedWith(
        'TooSmallAmountOut',
      );
    });
  });
});
