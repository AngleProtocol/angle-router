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
  MockSavingsRateIlliquid,
  MockSavingsRateIlliquid__factory,
  MockTokenPermit,
  MockTokenPermit__factory,
} from '../../../../typechain';
import { expect } from '../../../../utils/chai-setup';
import { ActionTypeSidechain, initToken, TypePermit } from '../../../../utils/helpers';
import { signPermit } from '../../../../utils/sign';
import { deployUpgradeable } from '../../utils/helpers';

contract('BaseAngleRouterSidechain - ERC4626 functionalities', () => {
  // As a proxy for the AngleRouter sidechain we're using the Polygon implementation of it
  let deployer: SignerWithAddress;
  let USDC: MockTokenPermit;
  let DAI: MockTokenPermit;
  let governor: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let router: MockRouterSidechain;
  let stratIlliquid: MockSavingsRateIlliquid;
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
    stratIlliquid = (await new MockSavingsRateIlliquid__factory(deployer).deploy(
      USDC.address,
    )) as MockSavingsRateIlliquid;
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

      const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.mintSavingsRate];
      const dataMixer = [transferData, mintData];

      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('999', 6));
      expect(await strat.balanceOf(bob.address)).to.be.equal(parseEther('1'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('1'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(0);
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

      const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.mintSavingsRate];
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
      await router
        .connect(deployer)
        .mixer([], [ActionTypeSidechain.transfer, ActionTypeSidechain.mintSavingsRate], [transferData2, mintData2]);

      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('999', 6));
      expect(await USDC.balanceOf(strat.address)).to.be.equal(parseUnits('301', 6));
      expect(await USDC.balanceOf(deployer.address)).to.be.equal(0);
      expect(await strat.balanceOf(bob.address)).to.be.equal(parseEther('1'));
      expect(await strat.balanceOf(deployer.address)).to.be.equal(parseEther('300'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('301'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(0);
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
      const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.mintSavingsRate];
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

      const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.depositSavingsRate];
      const dataMixer = [transferData, mintData];

      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('999', 6));
      expect(await strat.balanceOf(bob.address)).to.be.equal(parseEther('1'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('1'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(0);
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

      const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.depositSavingsRate];
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
        .mixer([], [ActionTypeSidechain.transfer, ActionTypeSidechain.depositSavingsRate], [transferData2, mintData2]);

      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('999', 6));
      expect(await USDC.balanceOf(strat.address)).to.be.equal(parseUnits('301', 6));
      expect(await USDC.balanceOf(deployer.address)).to.be.equal(0);
      expect(await strat.balanceOf(bob.address)).to.be.equal(parseEther('1'));
      expect(await strat.balanceOf(deployer.address)).to.be.equal(parseEther('300'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('301'));
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
      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC],
      );

      const mintData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256', 'address', 'uint256'],
        [USDC.address, strat.address, parseUnits('1', 6), bob.address, parseEther('1000')],
      );

      const actions = [ActionTypeSidechain.transfer, ActionTypeSidechain.depositSavingsRate];
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
      const actions = [
        ActionTypeSidechain.transfer,
        ActionTypeSidechain.oneInch,
        ActionTypeSidechain.depositSavingsRate,
      ];
      await router.connect(alice).mixer([], actions, dataMixer);
      expect(await DAI.balanceOf(oneInch.address)).to.be.equal(parseEther('1'));
      expect(await USDC.balanceOf(strat.address)).to.be.equal(parseUnits('1', 6));

      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await strat.balanceOf(bob.address)).to.be.equal(parseEther('1'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('1'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(0);
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

      const actions = [
        ActionTypeSidechain.transfer,
        ActionTypeSidechain.mintSavingsRate,
        ActionTypeSidechain.redeemSavingsRate,
      ];
      const dataMixer = [transferData, mintData, redeemData];

      await strat.connect(alice).approve(router.address, parseEther('13'));

      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(parseUnits('1', 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('999', 6));
      expect(await strat.balanceOf(bob.address)).to.be.equal(parseEther('0'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('0'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(0);
      expect(await strat.allowance(alice.address, router.address)).to.be.equal(parseEther('12'));
    });
    it('success - in two steps', async () => {
      await USDC.connect(alice).approve(strat.address, parseUnits('1000', 6));
      await strat.connect(alice).mint(parseEther('1000'), alice.address);

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'address', 'uint256'],
        [strat.address, parseEther('1'), bob.address, parseUnits('0', 6)],
      );

      const actions = [ActionTypeSidechain.redeemSavingsRate];
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

      const actions = [ActionTypeSidechain.redeemSavingsRate];
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

      const actions = [
        ActionTypeSidechain.transfer,
        ActionTypeSidechain.mintSavingsRate,
        ActionTypeSidechain.withdrawSavingsRate,
      ];
      const dataMixer = [transferData, mintData, redeemData];

      await strat.connect(alice).approve(router.address, parseEther('13'));

      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(parseUnits('1', 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('999', 6));
      expect(await strat.balanceOf(bob.address)).to.be.equal(parseEther('0'));
      expect(await strat.totalSupply()).to.be.equal(parseEther('0'));
      expect(await USDC.allowance(router.address, strat.address)).to.be.equal(0);
      expect(await strat.allowance(alice.address, router.address)).to.be.equal(parseEther('12'));
    });
    it('success - in two steps', async () => {
      await USDC.connect(alice).approve(strat.address, parseUnits('1000', 6));
      await strat.connect(alice).mint(parseEther('1000'), alice.address);

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'address', 'uint256'],
        [strat.address, parseUnits('1', 6), bob.address, parseEther('100')],
      );

      const actions = [ActionTypeSidechain.withdrawSavingsRate];
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

      const actions = [ActionTypeSidechain.redeemSavingsRate];
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

      const actions = [ActionTypeSidechain.withdrawSavingsRate, ActionTypeSidechain.oneInch, ActionTypeSidechain.sweep];
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

  describe('mixer - prepareRedeem', () => {
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
        [USDC.address, stratIlliquid.address, parseEther('1'), alice.address, parseEther('100')],
      );

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'address', 'uint256'],
        [stratIlliquid.address, parseEther('1'), bob.address, parseUnits('0', 6)],
      );

      const actions = [
        ActionTypeSidechain.transfer,
        ActionTypeSidechain.mintSavingsRate,
        ActionTypeSidechain.prepareRedeemSavingsRate,
      ];
      const dataMixer = [transferData, mintData, redeemData];

      await stratIlliquid.connect(alice).approve(router.address, parseEther('13'));

      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(parseUnits('1', 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('999', 6));
      expect(await stratIlliquid.balanceOf(bob.address)).to.be.equal(parseEther('0'));
      expect(await stratIlliquid.totalSupply()).to.be.equal(parseEther('0'));
      expect(await USDC.allowance(router.address, stratIlliquid.address)).to.be.equal(0);
      expect(await stratIlliquid.allowance(alice.address, router.address)).to.be.equal(parseEther('12'));
    });
    it('success - in two steps', async () => {
      await USDC.connect(alice).approve(stratIlliquid.address, parseUnits('1000', 6));
      await stratIlliquid.connect(alice).mint(parseEther('1000'), alice.address);

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'address', 'uint256'],
        [stratIlliquid.address, parseEther('1'), bob.address, parseUnits('0', 6)],
      );

      const actions = [ActionTypeSidechain.prepareRedeemSavingsRate];
      const dataMixer = [redeemData];

      await stratIlliquid.connect(alice).approve(router.address, parseEther('1300'));

      await router.connect(alice).mixer([], actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(parseUnits('1', 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(0);
      expect(await stratIlliquid.balanceOf(alice.address)).to.be.equal(parseEther('999'));
      expect(await stratIlliquid.totalSupply()).to.be.equal(parseEther('999'));
      expect(await USDC.allowance(router.address, stratIlliquid.address)).to.be.equal(0);
      expect(await stratIlliquid.allowance(alice.address, router.address)).to.be.equal(parseEther('1299'));
    });
    it('success - in two steps when a portion is put aside', async () => {
      await USDC.connect(alice).approve(stratIlliquid.address, parseUnits('1000', 6));
      await stratIlliquid.connect(alice).mint(parseEther('1000'), alice.address);

      await stratIlliquid.setSplitFactor(parseUnits('0.3', 9));

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'address', 'uint256'],
        [stratIlliquid.address, parseEther('1'), bob.address, parseUnits('0', 6)],
      );

      const actions = [ActionTypeSidechain.prepareRedeemSavingsRate];
      const dataMixer = [redeemData];

      await stratIlliquid.connect(alice).approve(router.address, parseEther('1300'));

      await router.connect(alice).mixer([], actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(parseUnits('0.7', 6));
      expect(await stratIlliquid.receiverRewards(bob.address)).to.be.equal(parseUnits('0.3', 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(0);
      expect(await stratIlliquid.balanceOf(alice.address)).to.be.equal(parseEther('999'));
      expect(await stratIlliquid.totalSupply()).to.be.equal(parseEther('999'));
      expect(await USDC.allowance(router.address, stratIlliquid.address)).to.be.equal(0);
      expect(await stratIlliquid.allowance(alice.address, router.address)).to.be.equal(parseEther('1299'));
    });
    it('reverts - too small amount out', async () => {
      await USDC.connect(alice).approve(stratIlliquid.address, parseUnits('1000', 6));
      await stratIlliquid.connect(alice).mint(parseEther('1000'), alice.address);

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'address', 'uint256'],
        [stratIlliquid.address, parseEther('1'), bob.address, parseUnits('10', 6)],
      );

      const actions = [ActionTypeSidechain.prepareRedeemSavingsRate];
      const dataMixer = [redeemData];

      await stratIlliquid.connect(alice).approve(router.address, parseEther('1300'));

      await expect(router.connect(alice).mixer([], actions, dataMixer)).to.be.revertedWith('TooSmallAmountOut');
    });
  });
  describe('mixer - claimRedeem', () => {
    it('success - claiming for someone else', async () => {
      await USDC.mint(stratIlliquid.address, parseUnits('1000', 6));
      await stratIlliquid.setReceiverRewards(bob.address, parseUnits('300', 6));

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'address[]'],
        [stratIlliquid.address, bob.address, []],
      );

      const actions = [ActionTypeSidechain.claimRedeemSavingsRate];
      const dataMixer = [redeemData];
      await router.connect(alice).mixer([], actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(parseUnits('300', 6));
    });
    it('success - claiming for yourself but wrong receiver', async () => {
      await USDC.mint(stratIlliquid.address, parseUnits('1000', 6));
      await stratIlliquid.setReceiverRewards(alice.address, parseUnits('300', 6));

      const redeemData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'address[]'],
        [stratIlliquid.address, alice.address, [alice.address]],
      );

      const actions = [ActionTypeSidechain.claimRedeemSavingsRate];
      const dataMixer = [redeemData];
      await router.connect(alice).mixer([], actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(parseUnits('0', 6));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(parseUnits('1300', 6));
      expect(await stratIlliquid.counter(alice.address)).to.be.equal(1);
    });
  });
});
