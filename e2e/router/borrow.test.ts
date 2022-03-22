import yargs from 'yargs';
import { ethers, network, deployments } from 'hardhat';
import { expect } from '../../utils/chai-setup';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { CONTRACTS_ADDRESSES, ChainId } from '@angleprotocol/sdk';

const argv = yargs.env('').boolean('ci').parseSync();

// we import our utilities
import { ActionType, TypeTransfer, TypeSwap, SwapType, BASE_PARAMS, initToken } from '../../utils/helpers';

import {
  AngleRouter,
  MockANGLE,
  MockVaultManager,
  MockVaultManager__factory,
  AngleRouter__factory,
  ERC20,
  IWStETH__factory,
  IStETH__factory,
  ProxyAdmin__factory,
  ProxyAdmin,
} from '../../typechain';
import { AgToken, AgToken__factory } from '../../typechain/core';
import { addCollateral, borrow, createVault, encodeAngleBorrow } from '../../utils/helpersEncoding';

let ANGLE: MockANGLE;
let agEUR: AgToken;

let angleRouter: AngleRouter;

let USDC: ERC20;
let wETH: ERC20;
let WSTETHAddress: string;
let STETH: string;

let deployer: SignerWithAddress;
let guardianSigner;
let richUSDCUser;
let user: SignerWithAddress;
let cleanAddress: SignerWithAddress;
let governor: SignerWithAddress;
let treasury: SignerWithAddress;

let UNIT_ETH: BigNumber;
let UNIT_USDC: BigNumber;
let UNIT_WBTC: BigNumber;
let UNIT_DAI: BigNumber;
let ETHORACLEUSD: BigNumber;
let ETHdecimal: BigNumber;
let USDCdecimal: BigNumber;
let wBTCdecimal: BigNumber;
let DAIdecimal: BigNumber;

let vaultManagerA: MockVaultManager;
let vaultManagerB: MockVaultManager;

// Testing Angle Router
describe('AngleRouter01 - borrower', () => {
  beforeEach(async () => {
    ({ deployer, governor, user, alice: cleanAddress, bob: treasury } = await ethers.getNamedSigners());

    const guardian = CONTRACTS_ADDRESSES[ChainId.MAINNET].Guardian! as string;
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [guardian],
    });
    guardianSigner = await ethers.provider.getSigner(guardian);

    const richUSDCUserAddress = '0x6262998Ced04146fA42253a5C0AF90CA02dfd2A3';
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [richUSDCUserAddress],
    });
    richUSDCUser = await ethers.getSigner(richUSDCUserAddress);

    await network.provider.send('hardhat_setBalance', [guardian, '0x10000000000000000000000000000']);
    await network.provider.send('hardhat_setBalance', [user.address, '0x10000000000000000000000000000']);

    const proxyAngleRouterAddress = CONTRACTS_ADDRESSES[ChainId.MAINNET].AngleRouter!;

    angleRouter = new ethers.Contract(
      proxyAngleRouterAddress,
      AngleRouter__factory.createInterface(),
      deployer,
    ) as AngleRouter;

    ({ token: USDC } = await initToken('USDC', USDCdecimal, governor));
    const agEURAddress = CONTRACTS_ADDRESSES[ChainId.MAINNET].agEUR.AgToken as string;
    agEUR = new ethers.Contract(agEURAddress, AgToken__factory.createInterface(), deployer) as AgToken;
    WSTETHAddress = await angleRouter.WSTETH();
    STETH = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';

    await (
      await angleRouter.connect(guardianSigner).changeAllowance([STETH], [WSTETHAddress], [ethers.constants.MaxUint256])
    ).wait();

    ETHdecimal = BigNumber.from('18');
    USDCdecimal = BigNumber.from('6');
    wBTCdecimal = BigNumber.from('8');
    DAIdecimal = BigNumber.from('18');

    vaultManagerA = (await new MockVaultManager__factory(guardianSigner).deploy(treasury.address)) as MockVaultManager;
    vaultManagerB = (await new MockVaultManager__factory(guardianSigner).deploy(treasury.address)) as MockVaultManager;

    vaultManagerA
      .connect(user)
      .setParams(
        user.address,
        USDC.address,
        agEUR.address,
        BigNumber.from(1),
        BigNumber.from(1),
        BigNumber.from(1),
        BigNumber.from(1),
      );
    vaultManagerB
      .connect(user)
      .setParams(
        user.address,
        WSTETHAddress,
        agEUR.address,
        BigNumber.from(1),
        BigNumber.from(1),
        BigNumber.from(1),
        BigNumber.from(1),
      );

    UNIT_ETH = BigNumber.from(10).pow(ETHdecimal);
    UNIT_USDC = BigNumber.from(10).pow(USDCdecimal);
    UNIT_WBTC = BigNumber.from(10).pow(wBTCdecimal);
    UNIT_DAI = BigNumber.from(10).pow(DAIdecimal);
  });

  describe('Borrower test', () => {
    describe('Decoding test', () => {
      it('read', async () => {
        const calls1Borrow = [createVault(user.address), createVault(user.address), addCollateral(1, UNIT_DAI)];
        const calls2Borrow = [
          createVault(user.address),
          addCollateral(1, UNIT_DAI),
          borrow(1, UNIT_DAI.div(BigNumber.from(2))),
        ];

        const dataBorrow1 = await encodeAngleBorrow(
          USDC.address,
          agEUR.address,
          vaultManagerA.address,
          cleanAddress.address,
          treasury.address,
          '0x',
          calls1Borrow,
        );

        const dataBorrow2 = await encodeAngleBorrow(
          WSTETHAddress,
          agEUR.address,
          vaultManagerB.address,
          governor.address,
          vaultManagerA.address,
          '0x1200339990',
          calls2Borrow,
        );

        const actions = [ActionType.borrower, ActionType.borrower];
        const dataMixer = [dataBorrow1, dataBorrow2];

        console.log('dataBorrow1', dataBorrow1);
        console.log('dataBorrow2', dataBorrow2);

        await angleRouter.connect(deployer).mixer([], [], [], actions, dataMixer);
      });
    });
    describe('Testing new swap types', () => {
      it('success - ETH -> wSTETH', async () => {
        const ETHBalanceBefore = await ethers.provider.getBalance(user.address);

        const stETHContract = new ethers.Contract(STETH, IStETH__factory.createInterface(), user);
        const supposedAmountToReceive: BigNumber = await stETHContract.getSharesByPooledEth(UNIT_ETH);
        const minAmountOut = supposedAmountToReceive.mul(BigNumber.from(95).div(BigNumber.from(100)));

        const transfers: TypeTransfer[] = [];
        const swaps: TypeSwap[] = [
          {
            inToken: WSTETHAddress,
            collateral: WSTETHAddress,
            amountIn: UNIT_ETH,
            minAmountOut: BigNumber.from(0),
            args: '0x',
            swapType: SwapType.None,
          },
        ];
        const actions: ActionType[] = [];
        const datas: string[] = [];
        const receipt = await (
          await angleRouter.connect(user).mixer([], transfers, swaps, actions, datas, { value: UNIT_ETH })
        ).wait();

        const wSTETHContract = new ethers.Contract(WSTETHAddress, IWStETH__factory.createInterface(), user);
        const balanceWSTETH: BigNumber = await wSTETHContract.balanceOf(user.address);
        expect(balanceWSTETH.gte(minAmountOut)).to.be.true;
      });
      it('success - stETH -> wSTETH', async () => {
        // first get some stETH
        const stETHContract = new ethers.Contract(STETH, IStETH__factory.createInterface(), user);
        await (await stETHContract.connect(user).submit(ethers.constants.AddressZero, { value: UNIT_ETH })).wait();
        const balanceStETHBefore: BigNumber = await stETHContract.balanceOf(user.address);

        await (await stETHContract.connect(user).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
        const supposedAmountToReceive: BigNumber = await stETHContract.getSharesByPooledEth(balanceStETHBefore);
        const minAmountOut = supposedAmountToReceive.mul(BigNumber.from(95).div(BigNumber.from(100)));

        const transfers: TypeTransfer[] = [];
        const swaps: TypeSwap[] = [
          {
            inToken: STETH,
            collateral: WSTETHAddress,
            amountIn: balanceStETHBefore,
            minAmountOut: minAmountOut,
            args: '0x',
            swapType: SwapType.WrapStETH,
          },
        ];
        const actions: ActionType[] = [];
        const datas: string[] = [];
        await (await angleRouter.connect(user).mixer([], transfers, swaps, actions, datas)).wait();

        const wSTETHContract = new ethers.Contract(WSTETHAddress, IWStETH__factory.createInterface(), user);
        const balanceWSTETH: BigNumber = await wSTETHContract.balanceOf(user.address);
        const stETHBalanceAfter: BigNumber = await stETHContract.balanceOf(user.address);
        expect(balanceWSTETH.gte(minAmountOut)).to.be.true;
      });
    });
  });
});
