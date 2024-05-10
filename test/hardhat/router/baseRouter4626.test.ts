import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, Signer } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import hre, { contract, ethers, web3 } from 'hardhat';

import {
  Mock1Inch,
  Mock1Inch__factory,
  MockERC4626,
  MockERC4626__factory,
  MockRouterSidechain,
  MockRouterSidechain__factory,
  MockTokenPermit,
  MockTokenPermit__factory,
} from '../../../typechain';
import { expect } from '../../../utils/chai-setup';
import { inReceipt } from '../../../utils/expectEvent';
import { ActionType, initToken, TypePermit } from '../../../utils/helpers';
import { signPermit } from '../../../utils/sign';
import { deployUpgradeable, MAX_UINT256 } from '../utils/helpers';

contract('BaseRouter - ERC4626 functionalities', () => {
  // As a proxy for the AngleRouter sidechain we're using the Polygon implementation of it
  let deployer: SignerWithAddress;
  let USDC: MockTokenPermit;
  let DAI: MockTokenPermit;
  let governor: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let router: MockRouterSidechain;
  let oneInch: Mock1Inch;
  let strat: MockERC4626;
  let UNIT_USDC: BigNumber;
  let UNIT_DAI: BigNumber;
  let USDCdecimal: BigNumber;
  let DAIdecimal: BigNumber;

  const impersonatedSigners: { [key: string]: Signer } = {};

  before(async () => {
    ({ deployer, alice, bob, governor } = await ethers.getNamedSigners());
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
    router = (await deployUpgradeable(new MockRouterSidechain__factory(deployer))) as MockRouterSidechain;
    ({ token: USDC } = await initToken('USDC', USDCdecimal, governor));
    DAI = (await new MockTokenPermit__factory(deployer).deploy('DAI', 'DAI', DAIdecimal)) as MockTokenPermit;
    USDC = (await new MockTokenPermit__factory(deployer).deploy('USDC', 'USDC', USDCdecimal)) as MockTokenPermit;
    strat = (await new MockERC4626__factory(deployer).deploy(USDC.address, 'testsr', 'testsr')) as MockERC4626;
    await USDC.mint(alice.address, parseUnits('1000', 6));
    oneInch = (await new Mock1Inch__factory(deployer).deploy(DAI.address, USDC.address)) as Mock1Inch;
    await router.initializeRouter(alice.address, alice.address, oneInch.address);
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

      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC],
      );

      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseEther('1'), bob.address, parseEther('100')],
      );

      const actions = [ActionType.transfer, ActionType.mint4626];
      const dataMixer = [transferData, mintData];

      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('999', 6));
      expect(await strat.balanceOf(bob.address)).to.be.equal(parseEther('1'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('1'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(MAX_UINT256);
    });
    it('success - shares minted to the to address - when there are shares existing', async () => {
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

      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC],
      );

      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseEther('1'), bob.address, parseEther('100')],
      );

      const actions = [ActionType.transfer, ActionType.mint4626];
      const dataMixer = [transferData, mintData];
      await router.connect(alice).mixer(permits, actions, dataMixer);

      await USDC.mint(deployer.address, parseUnits('300', 6));
      const transferData2 = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, parseUnits('300', 6)],
      );
      const mintData2 = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseEther('300'), deployer.address, parseEther('100')],
      );
      await USDC.connect(deployer).approve(router.address, parseUnits('1000', 6));
      await router.connect(deployer).mixer([], [ActionType.transfer, ActionType.mint4626], [transferData2, mintData2]);

      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('999', 6));
      expect(await USDC.balanceOf(strat.address)).to.be.equal(parseUnits('301', 6));
      expect(await USDC.balanceOf(deployer.address)).to.be.equal(0);
      expect(await strat.balanceOf(bob.address)).to.be.equal(parseEther('1'));
      expect(await strat.balanceOf(deployer.address)).to.be.equal(parseEther('300'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('301'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(MAX_UINT256);
    });
    it('reverts - too big amount in', async () => {
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
      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC],
      );
      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseEther('1'), bob.address, parseEther('0')],
      );
      const actions = [ActionType.transfer, ActionType.mint4626];
      const dataMixer = [transferData, mintData];
      await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.reverted;
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

      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC],
      );

      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseUnits('1', 6), bob.address, parseEther('0')],
      );

      const actions = [ActionType.transfer, ActionType.deposit4626];
      const dataMixer = [transferData, mintData];

      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('999', 6));
      expect(await strat.balanceOf(bob.address)).to.be.equal(parseEther('1'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('1'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(MAX_UINT256);
    });
    it('success - shares minted to the to address - when there are already shares', async () => {
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

      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC],
      );

      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseUnits('1', 6), bob.address, parseEther('0')],
      );

      const actions = [ActionType.transfer, ActionType.deposit4626];
      const dataMixer = [transferData, mintData];

      await router.connect(alice).mixer(permits, actions, dataMixer);

      await USDC.mint(deployer.address, parseUnits('300', 6));
      const transferData2 = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, parseUnits('300', 6)],
      );
      const mintData2 = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseUnits('300', 6), deployer.address, parseEther('100')],
      );
      await USDC.connect(deployer).approve(router.address, parseUnits('1000', 6));
      await router
        .connect(deployer)
        .mixer([], [ActionType.transfer, ActionType.deposit4626], [transferData2, mintData2]);

      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('999', 6));
      expect(await USDC.balanceOf(strat.address)).to.be.equal(parseUnits('301', 6));
      expect(await USDC.balanceOf(deployer.address)).to.be.equal(0);
      expect(await strat.balanceOf(bob.address)).to.be.equal(parseEther('1'));
      expect(await strat.balanceOf(deployer.address)).to.be.equal(parseEther('300'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('301'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(MAX_UINT256);
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
      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC],
      );

      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseUnits('1', 6), bob.address, parseEther('1000')],
      );

      const actions = [ActionType.transfer, ActionType.deposit4626];
      const dataMixer = [transferData, mintData];

      await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.revertedWith('TooSmallAmountOut');
    });
    it('success - swap and deposit', async () => {
      await DAI.mint(alice.address, parseEther('10'));
      await DAI.connect(alice).approve(router.address, parseUnits('100', DAIdecimal));

      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [DAI.address, router.address, UNIT_DAI],
      );
      const payload1inch = oneInch.interface.encodeFunctionData('swap', [
        ethers.constants.AddressZero,
        {
          srcToken: DAI.address,
          dstToken: USDC.address,
          srcReceiver: oneInch.address,
          dstReceiver: router.address,
          amount: UNIT_DAI,
          minReturnAmount: BigNumber.from(0),
          flags: BigNumber.from(0),
          permit: '0x',
        },
        '0x',
      ]);
      const swapData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'bytes'],
        [DAI.address, parseEther('0'), payload1inch],
      );

      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseUnits('1', 6), bob.address, parseEther('0')],
      );
      const dataMixer = [transferData, swapData, mintData];
      const actions = [ActionType.transfer, ActionType.oneInch, ActionType.deposit4626];
      await router.connect(alice).mixer([], actions, dataMixer);
      expect(await DAI.balanceOf(oneInch.address)).to.be.equal(parseEther('1'));
      expect(await USDC.balanceOf(strat.address)).to.be.equal(parseUnits('1', 6));

      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await strat.balanceOf(bob.address)).to.be.equal(parseEther('1'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('1'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(MAX_UINT256);
    });
  });

  describe('mixer - redeem', () => {
    it('success - directly in the same transaction', async () => {
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

      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC],
      );

      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseEther('1'), alice.address, parseEther('100')],
      );

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'address', 'uint256'],
        [strat.address, parseEther('1'), bob.address, parseUnits('0', 6)],
      );

      const actions = [ActionType.transfer, ActionType.mint4626, ActionType.redeem4626];
      const dataMixer = [transferData, mintData, redeemData];

      await strat.connect(alice).approve(router.address, parseEther('13'));

      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(parseUnits('1', 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('999', 6));
      expect(await strat.balanceOf(bob.address)).to.be.equal(parseEther('0'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('0'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(MAX_UINT256);
      expect(await strat.allowance(alice.address, router.address)).to.be.equal(parseEther('12'));
    });
    it('success - in two steps', async () => {
      await USDC.connect(alice).approve(strat.address, parseUnits('1000', 6));
      await strat.connect(alice).mint(parseEther('1000'), alice.address);

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'address', 'uint256'],
        [strat.address, parseEther('1'), bob.address, parseUnits('0', 6)],
      );

      const actions = [ActionType.redeem4626];
      const dataMixer = [redeemData];

      await strat.connect(alice).approve(router.address, parseEther('1300'));

      await router.connect(alice).mixer([], actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(parseUnits('1', 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(0);
      expect(await strat.balanceOf(alice.address)).to.be.equal(parseEther('999'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('999'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(0);
      expect(await strat.allowance(alice.address, router.address)).to.be.equal(parseEther('1299'));
    });
    it('reverts - too small amount out', async () => {
      await USDC.connect(alice).approve(strat.address, parseUnits('1000', 6));
      await strat.connect(alice).mint(parseEther('1000'), alice.address);

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'address', 'uint256'],
        [strat.address, parseEther('1'), bob.address, parseUnits('10', 6)],
      );

      const actions = [ActionType.redeem4626];
      const dataMixer = [redeemData];

      await strat.connect(alice).approve(router.address, parseEther('1300'));

      await expect(router.connect(alice).mixer([], actions, dataMixer)).to.be.revertedWith('TooSmallAmountOut');
    });
  });

  describe('mixer - withdraw', () => {
    it('success - directly in the same transaction', async () => {
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

      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC],
      );

      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseEther('1'), alice.address, parseEther('100')],
      );

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'address', 'uint256'],
        [strat.address, parseUnits('1', 6), bob.address, parseEther('2')],
      );

      const actions = [ActionType.transfer, ActionType.mint4626, ActionType.withdraw4626];
      const dataMixer = [transferData, mintData, redeemData];

      await strat.connect(alice).approve(router.address, parseEther('13'));

      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(parseUnits('1', 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('999', 6));
      expect(await strat.balanceOf(bob.address)).to.be.equal(parseEther('0'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('0'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(MAX_UINT256);
      expect(await strat.allowance(alice.address, router.address)).to.be.equal(parseEther('12'));
    });
    it('success - in two steps', async () => {
      await USDC.connect(alice).approve(strat.address, parseUnits('1000', 6));
      await strat.connect(alice).mint(parseEther('1000'), alice.address);

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'address', 'uint256'],
        [strat.address, parseUnits('1', 6), bob.address, parseEther('100')],
      );

      const actions = [ActionType.withdraw4626];
      const dataMixer = [redeemData];

      await strat.connect(alice).approve(router.address, parseEther('1300'));

      await router.connect(alice).mixer([], actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(parseUnits('1', 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(0);
      expect(await strat.balanceOf(alice.address)).to.be.equal(parseEther('999'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('999'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(0);
      expect(await strat.allowance(alice.address, router.address)).to.be.equal(parseEther('1299'));
    });
    it('reverts - too big shares burnt', async () => {
      await USDC.connect(alice).approve(strat.address, parseUnits('1000', 6));
      await strat.connect(alice).mint(parseEther('1000'), alice.address);

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'address', 'uint256'],
        [strat.address, parseUnits('1', 6), bob.address, parseEther('100')],
      );

      const actions = [ActionType.redeem4626];
      const dataMixer = [redeemData];

      await strat.connect(alice).approve(router.address, parseEther('1300'));

      await expect(router.connect(alice).mixer([], actions, dataMixer)).to.be.revertedWith('TooSmallAmountOut');
    });
    it('success - withdraw and swap', async () => {
      const strat2 = (await new MockERC4626__factory(deployer).deploy(DAI.address, 'testsr', 'testsr')) as MockERC4626;
      await DAI.mint(alice.address, parseEther('100'));
      await DAI.connect(alice).approve(strat2.address, parseEther('1'));
      await strat2.connect(alice).mint(parseEther('1'), alice.address);
      await strat2.connect(alice).approve(router.address, parseEther('1300'));

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'address', 'uint256'],
        [strat2.address, parseEther('1'), router.address, parseEther('100')],
      );
      const payload1inch = oneInch.interface.encodeFunctionData('swap', [
        ethers.constants.AddressZero,
        {
          srcToken: DAI.address,
          dstToken: USDC.address,
          srcReceiver: oneInch.address,
          dstReceiver: router.address,
          amount: UNIT_DAI,
          minReturnAmount: BigNumber.from(0),
          flags: BigNumber.from(0),
          permit: '0x',
        },
        '0x',
      ]);
      const swapData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'bytes'],
        [DAI.address, parseEther('0'), payload1inch],
      );
      const sweepData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'address'],
        [USDC.address, parseUnits('0', USDCdecimal), bob.address],
      );

      const actions = [ActionType.withdraw4626, ActionType.oneInch, ActionType.sweep];
      const dataMixer = [redeemData, swapData, sweepData];

      await router.connect(alice).mixer([], actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(parseUnits('1', 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('1000', 6));
      expect(await strat2.balanceOf(alice.address)).to.be.equal(parseEther('0'));
      expect(await strat2.totalSupply()).to.be.equal(parseEther('0'));
      expect(await USDC.allowance(router.address, strat2.address)).to.be.equal(0);
      expect(await strat2.allowance(alice.address, router.address)).to.be.equal(parseEther('1299'));
    });
  });

  describe('mixer - deposit with referral', () => {
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

      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC],
      );

      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256', 'address'],
        [USDC.address, strat.address, parseUnits('1', 6), bob.address, parseEther('0'), bob.address],
      );

      const actions = [ActionType.transfer, ActionType.deposit4626Referral];
      const dataMixer = [transferData, mintData];

      const receipt = await (await router.connect(alice).mixer(permits, actions, dataMixer)).wait();
      inReceipt(receipt, 'ReferredDeposit', {
        caller: alice.address,
        owner: bob.address,
        assets: parseUnits('1', 6),
        shares: parseEther('1'),
        savings: strat.address,
        referrer: bob.address,
      });

      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('999', 6));
      expect(await strat.balanceOf(bob.address)).to.be.equal(parseEther('1'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('1'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(MAX_UINT256);
    });
    it('success - shares minted to the to address - when there are already shares', async () => {
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

      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC],
      );

      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256', 'address'],
        [USDC.address, strat.address, parseUnits('1', 6), bob.address, parseEther('0'), alice.address],
      );

      const actions = [ActionType.transfer, ActionType.deposit4626Referral];
      const dataMixer = [transferData, mintData];

      const receipt = await (await router.connect(alice).mixer(permits, actions, dataMixer)).wait();

      inReceipt(receipt, 'ReferredDeposit', {
        caller: alice.address,
        owner: bob.address,
        assets: parseUnits('1', 6),
        shares: parseEther('1'),
        savings: strat.address,
        referrer: alice.address,
      });

      await USDC.mint(deployer.address, parseUnits('300', 6));
      const transferData2 = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, parseUnits('300', 6)],
      );
      const mintData2 = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256', 'address'],
        [USDC.address, strat.address, parseUnits('300', 6), deployer.address, parseEther('100'), USDC.address],
      );
      await USDC.connect(deployer).approve(router.address, parseUnits('1000', 6));
      const receipt2 = await (
        await router
          .connect(deployer)
          .mixer([], [ActionType.transfer, ActionType.deposit4626Referral], [transferData2, mintData2])
      ).wait();

      inReceipt(receipt2, 'ReferredDeposit', {
        caller: deployer.address,
        owner: deployer.address,
        assets: parseUnits('300', 6),
        shares: parseEther('300'),
        savings: strat.address,
        referrer: USDC.address,
      });

      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('999', 6));
      expect(await USDC.balanceOf(strat.address)).to.be.equal(parseUnits('301', 6));
      expect(await USDC.balanceOf(deployer.address)).to.be.equal(0);
      expect(await strat.balanceOf(bob.address)).to.be.equal(parseEther('1'));
      expect(await strat.balanceOf(deployer.address)).to.be.equal(parseEther('300'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('301'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(MAX_UINT256);
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
      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC],
      );

      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256', 'address'],
        [USDC.address, strat.address, parseUnits('1', 6), bob.address, parseEther('1000'), USDC.address],
      );

      const actions = [ActionType.transfer, ActionType.deposit4626Referral];
      const dataMixer = [transferData, mintData];

      await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.revertedWith('TooSmallAmountOut');
    });
    it('success - swap and deposit', async () => {
      await DAI.mint(alice.address, parseEther('10'));
      await DAI.connect(alice).approve(router.address, parseUnits('100', DAIdecimal));

      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [DAI.address, router.address, UNIT_DAI],
      );
      const payload1inch = oneInch.interface.encodeFunctionData('swap', [
        ethers.constants.AddressZero,
        {
          srcToken: DAI.address,
          dstToken: USDC.address,
          srcReceiver: oneInch.address,
          dstReceiver: router.address,
          amount: UNIT_DAI,
          minReturnAmount: BigNumber.from(0),
          flags: BigNumber.from(0),
          permit: '0x',
        },
        '0x',
      ]);
      const swapData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'bytes'],
        [DAI.address, parseEther('0'), payload1inch],
      );

      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256', 'address'],
        [USDC.address, strat.address, parseUnits('1', 6), bob.address, parseEther('0'), USDC.address],
      );
      const dataMixer = [transferData, swapData, mintData];
      const actions = [ActionType.transfer, ActionType.oneInch, ActionType.deposit4626Referral];
      const receipt = await (await router.connect(alice).mixer([], actions, dataMixer)).wait();
      inReceipt(receipt, 'ReferredDeposit', {
        caller: alice.address,
        owner: bob.address,
        assets: parseUnits('1', 6),
        shares: parseEther('1'),
        savings: strat.address,
        referrer: USDC.address,
      });

      expect(await DAI.balanceOf(oneInch.address)).to.be.equal(parseEther('1'));
      expect(await USDC.balanceOf(strat.address)).to.be.equal(parseUnits('1', 6));

      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await strat.balanceOf(bob.address)).to.be.equal(parseEther('1'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('1'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(MAX_UINT256);
    });
  });
  describe('deposit4626Referral', () => {
    /*

    function deposit4626Referral(
        IERC20 token,
        IERC4626 savings,
        uint256 amount,
        address to,
        uint256 minSharesOut,
        address referrer
    ) external {
        token.safeTransferFrom(msg.sender, address(this), amount);
        _changeAllowance(token, address(savings), type(uint256).max);
        _deposit4626Referral(savings, amount, to, minSharesOut, referrer);
    }
  */
    it('success - deposit successful', async () => {
      await USDC.mint(alice.address, parseUnits('1', 6));
      await USDC.connect(alice).approve(router.address, parseUnits('1', 6));

      await expect(
        router
          .connect(alice)
          .deposit4626Referral(
            USDC.address,
            strat.address,
            parseUnits('1', 6),
            bob.address,
            parseEther('1.5'),
            USDC.address,
          ),
      ).to.be.revertedWith('TooSmallAmountOut');

      const receipt = await (
        await router
          .connect(alice)
          .deposit4626Referral(
            USDC.address,
            strat.address,
            parseUnits('1', 6),
            bob.address,
            parseEther('0.5'),
            USDC.address,
          )
      ).wait();
      inReceipt(receipt, 'ReferredDeposit', {
        caller: alice.address,
        owner: bob.address,
        assets: parseUnits('1', 6),
        shares: parseEther('1'),
        savings: strat.address,
        referrer: USDC.address,
      });
      expect(await USDC.balanceOf(strat.address)).to.be.equal(parseUnits('1', 6));
      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await strat.balanceOf(bob.address)).to.be.equal(parseEther('1'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('1'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(MAX_UINT256);
    });
  });
});
