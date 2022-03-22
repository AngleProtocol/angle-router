import { expect } from '../../utils/chai-setup';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers, web3 } from 'hardhat';

// we import our utilities
import {
  // functions
  initAngle,
  initRouter,
  initCollateral,
  initToken,
  initGauge,
  TypeSwap,
  TypeTransfer,
  TypePermit,
  ActionType,
  SwapType,
  BASE_PARAMS,
} from '../../utils/helpers';

import {
  AngleRouter,
  IStETH__factory,
  IWStETH__factory,
  MockANGLE,
  MockTokenPermit,
  MockVaultManager,
  MockVaultManager__factory,
} from '../../typechain';

import {
  AgToken,
  AngleDistributor,
  ERC20,
  ERC20__factory,
  LiquidityGaugeV4,
  PerpetualManagerFront,
  PoolManager,
  SanToken,
  StableMasterFront,
  VeANGLE,
  VeBoostProxy,
} from '../../typechain/core';

import { BASE_18, parseAmount } from '@angleprotocol/sdk';
import { signPermit } from '../../utils/sign';

let ANGLE: MockANGLE;
let veANGLE: VeANGLE;
let veBoostProxy: VeBoostProxy;
let angleDistributor: AngleDistributor;
let stableMasterEUR: StableMasterFront;
let agEUR: AgToken;

let angleRouter: AngleRouter;

let USDC: MockTokenPermit;
let wETH: ERC20;
let WSTETHAddress: string;
let STETH: string;

let wBTC: MockTokenPermit;
let managerWBTC: PoolManager;
let sanTokenWBTC: SanToken;
let perpEURWBTC: PerpetualManagerFront;
let gaugeSanEURWBTC: LiquidityGaugeV4;
let gaugeSanEURWBTC2: LiquidityGaugeV4;

let DAI: MockTokenPermit;
let managerDAI: PoolManager;
let sanTokenDAI: SanToken;
let perpEURDAI: PerpetualManagerFront;
let gaugeSanEURDAI: LiquidityGaugeV4;

let vaultManagerA: MockVaultManager;
let vaultManagerB: MockVaultManager;

let deployer: SignerWithAddress;
let guardian: SignerWithAddress;
let user: SignerWithAddress;
let user2: SignerWithAddress;
let cleanAddress: SignerWithAddress;
let governor: SignerWithAddress;
let treasury: SignerWithAddress;

let UNIT_ETH: BigNumber;
let UNIT_DAI: BigNumber;
let BALANCE_AGEUR: BigNumber;
let BALANCE_ETH: BigNumber;
let BALANCE_USDC: BigNumber;
let BALANCE_WBTC: BigNumber;
let BALANCE_DAI: BigNumber;
let BALANCE2_ANGLE: BigNumber;
let BALANCE_GOV_WBTC: BigNumber;
let ETHORACLEUSD: BigNumber;
let wBTCORACLEUSD: BigNumber;
let USDCORACLEUSD: BigNumber;
let DAIORACLEUSD: BigNumber;
let ETHdecimal: BigNumber;
let USDCdecimal: BigNumber;
let wBTCdecimal: BigNumber;
let DAIdecimal: BigNumber;

export async function invariantFunds(owner: string): Promise<void> {
  expect(await agEUR.balanceOf(owner)).to.be.equal(ethers.constants.Zero);
  expect(await wBTC.balanceOf(owner)).to.be.equal(ethers.constants.Zero);
  expect(await DAI.balanceOf(owner)).to.be.equal(ethers.constants.Zero);
  expect(await USDC.balanceOf(owner)).to.be.equal(ethers.constants.Zero);
  // expect(await ethers.provider.getBalance(user.address)).to.be.equal(ethers.constants.Zero);
  expect(await sanTokenDAI.balanceOf(owner)).to.be.equal(ethers.constants.Zero);
  expect(await sanTokenWBTC.balanceOf(owner)).to.be.equal(ethers.constants.Zero);
  expect(await gaugeSanEURDAI.balanceOf(owner)).to.be.equal(ethers.constants.Zero);
  expect(await gaugeSanEURWBTC.balanceOf(owner)).to.be.equal(ethers.constants.Zero);
  expect(await gaugeSanEURWBTC2.balanceOf(owner)).to.be.equal(ethers.constants.Zero);
  expect(await ANGLE.balanceOf(owner)).to.be.equal(ethers.constants.Zero);
  expect(await veANGLE['balanceOf(address)'](owner)).to.be.equal(ethers.constants.Zero);
}

export async function invariantFundsUser(): Promise<void> {
  expect(await agEUR.balanceOf(user.address)).to.be.equal(BALANCE_AGEUR);
  expect(await wBTC.balanceOf(user.address)).to.be.equal(BALANCE_WBTC);
  expect(await DAI.balanceOf(user.address)).to.be.equal(BALANCE_DAI);
  expect(await USDC.balanceOf(user.address)).to.be.equal(BALANCE_USDC);
  expect(await ethers.provider.getBalance(user.address)).to.be.equal(BALANCE_ETH);
}

// Testing Angle Router
describe('AngleRouter01 - functionalities ETH', () => {
  before(async () => {
    ({
      deployer,
      guardian,
      user,
      alice: user2,
      governor,
      bob: cleanAddress,
      treasury,
    } = await ethers.getNamedSigners());

    ETHdecimal = BigNumber.from('18');
    USDCdecimal = BigNumber.from('6');
    wBTCdecimal = BigNumber.from('8');
    DAIdecimal = BigNumber.from('18');

    ETHORACLEUSD = BigNumber.from('2000');
    wBTCORACLEUSD = BigNumber.from('30000');
    USDCORACLEUSD = BigNumber.from('1');
    DAIORACLEUSD = BigNumber.from('1');

    wETH = new ethers.Contract(
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      ERC20__factory.createInterface(),
      deployer,
    ) as ERC20;

    ({ token: USDC } = await initToken('USDC', USDCdecimal, governor));
    ({
      ANGLE,
      veANGLE,
      veBoostProxy,
      angleDistributor,
      stableMaster: stableMasterEUR,
      agToken: agEUR,
    } = await initAngle(deployer, guardian));
    ({
      token: wBTC,
      manager: managerWBTC,
      sanToken: sanTokenWBTC,
      perpetualManager: perpEURWBTC,
    } = await initCollateral('wBTC', stableMasterEUR, ANGLE, deployer, wBTCdecimal, wBTCORACLEUSD, 0));
    ({
      token: DAI,
      manager: managerDAI,
      sanToken: sanTokenDAI,
      perpetualManager: perpEURDAI,
    } = await initCollateral('DAI', stableMasterEUR, ANGLE, deployer, DAIdecimal, DAIORACLEUSD, 0));

    ({ gauge: gaugeSanEURWBTC } = await initGauge(sanTokenWBTC.address, governor, ANGLE, veANGLE, veBoostProxy));
    ({ gauge: gaugeSanEURDAI } = await initGauge(sanTokenDAI.address, governor, ANGLE, veANGLE, veBoostProxy));
    ({ gauge: gaugeSanEURWBTC2 } = await initGauge(sanTokenWBTC.address, governor, ANGLE, veANGLE, veBoostProxy));

    ({ angleRouter } = await initRouter(
      governor,
      guardian,
      stableMasterEUR,
      [managerWBTC, managerDAI],
      [gaugeSanEURWBTC, gaugeSanEURDAI],
      wETH,
      USDC,
      DAI,
      ETHORACLEUSD,
      USDCORACLEUSD,
    ));

    WSTETHAddress = await angleRouter.WSTETH();
    STETH = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';

    vaultManagerA = (await new MockVaultManager__factory(user).deploy(treasury.address)) as MockVaultManager;
    vaultManagerB = (await new MockVaultManager__factory(user).deploy(treasury.address)) as MockVaultManager;

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

    await (
      await angleRouter.connect(guardian).changeAllowance([STETH], [WSTETHAddress], [ethers.constants.MaxUint256])
    ).wait();

    // Mint tokens of all type to user
    UNIT_ETH = BigNumber.from(10).pow(ETHdecimal);
    UNIT_DAI = BigNumber.from(10).pow(DAIdecimal);
    BALANCE_AGEUR = ethers.constants.Zero;
    BALANCE_ETH = await ethers.provider.getBalance(user.address);
    BALANCE_USDC = BigNumber.from(500000).mul(BigNumber.from(10).pow(USDCdecimal));
    BALANCE_WBTC = BigNumber.from(10).mul(BigNumber.from(10).pow(wBTCdecimal));
    BALANCE_DAI = BigNumber.from(500000).mul(BigNumber.from(10).pow(DAIdecimal));
    BALANCE_GOV_WBTC = BigNumber.from(50).mul(BigNumber.from(10).pow(wBTCdecimal));

    BALANCE2_ANGLE = BigNumber.from(1_000_000).mul(BASE_18);

    await (await wBTC.connect(governor).mint(user.address, BALANCE_WBTC)).wait();
    await (await USDC.connect(governor).mint(user.address, BALANCE_USDC)).wait();
    await (await DAI.connect(governor).mint(user.address, BALANCE_DAI)).wait();
    await (await ANGLE.connect(governor).mint(user2.address, BALANCE2_ANGLE)).wait();
    await (await wBTC.connect(governor).mint(governor.address, BALANCE_GOV_WBTC)).wait();

    await (await wBTC.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await sanTokenWBTC.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await sanTokenDAI.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();

    await (await USDC.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await DAI.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await ANGLE.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
  });

  describe('Router Functionalities', () => {
    describe('User Approval - Balance', () => {
      it('success - permit tokens', async () => {
        const swaps: TypeSwap[] = [];
        const transfers: TypeTransfer[] = [];
        const permits: TypePermit[] = [
          await signPermit(
            user,
            0,
            DAI.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
            angleRouter.address,
            ethers.constants.MaxUint256,
            'DAI',
          ),
          await signPermit(
            user,
            0,
            wBTC.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
            angleRouter.address,
            ethers.constants.MaxUint256,
            'wBTC',
          ),
          await signPermit(
            user,
            0,
            USDC.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
            angleRouter.address,
            ethers.constants.MaxUint256,
            'USDC',
          ),
        ];
        const actions: ActionType[] = [];
        const datas: string[] = [];

        await (await angleRouter.connect(cleanAddress).mixer(permits, transfers, swaps, actions, datas)).wait();
      });
    });
    describe('WSTETH', () => {
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
    // describe('Deposit', () => {
    //   it('success - no staking', async () => {
    //     const userGaugebalancePre = await gaugeSanEURDAI.balanceOf(user.address);
    //     const userSanbalancePre = await sanTokenDAI.balanceOf(user.address);
    //     const collateralParams = await stableMasterEUR.collateralMap(managerDAI.address);

    //     const transfers: TypeTransfer[] = [];
    //     const swaps: TypeSwap[] = [
    //       {
    //         inToken: wETH.address,
    //         collateral: DAI.address,
    //         amountIn: UNIT_ETH,
    //         minAmountOut: UNIT_DAI.mul(ETHORACLEUSD),
    //         args: '0x',
    //         swapType: SwapType.UniswapV3,
    //       },
    //     ];
    //     const actions = [ActionType.deposit];
    //     const datas: string[] = [
    //       ethers.utils.defaultAbiCoder.encode(
    //         ['address', 'uint256', 'bool', 'address', 'address', 'address', 'address'],
    //         [
    //           user.address,
    //           BASE_PARAMS,
    //           false,
    //           agEUR.address,
    //           DAI.address,
    //           ethers.constants.AddressZero,
    //           ethers.constants.AddressZero,
    //         ],
    //       ),
    //     ];

    //     await (
    //       await angleRouter.connect(cleanAddress).mixer([], transfers, swaps, actions, datas, { value: UNIT_ETH })
    //     ).wait();

    //     const expectSanTokenVal = UNIT_DAI.mul(ETHORACLEUSD).mul(BASE_18).div(collateralParams.sanRate);

    //     expect(await DAI.balanceOf(user.address)).to.be.equal(BALANCE_DAI);
    //     expect(await gaugeSanEURDAI.balanceOf(user.address)).to.be.equal(userGaugebalancePre);
    //     expect(await sanTokenDAI.balanceOf(user.address)).to.be.equal(userSanbalancePre.add(expectSanTokenVal));
    //     await invariantFunds(angleRouter.address);
    //     await invariantFunds(cleanAddress.address);
    //   });
    // });
    // describe('Mint', () => {
    //   it('success - swap', async () => {
    //     const userAgEURbalancePre = await agEUR.balanceOf(user.address);

    //     const transfers: TypeTransfer[] = [];
    //     const swaps: TypeSwap[] = [
    //       {
    //         inToken: wETH.address,
    //         collateral: DAI.address,
    //         amountIn: UNIT_ETH,
    //         minAmountOut: UNIT_DAI.mul(ETHORACLEUSD),
    //         args: '0x',
    //         swapType: SwapType.UniswapV3,
    //       },
    //     ];
    //     const actions = [ActionType.mint];
    //     const datas: string[] = [
    //       ethers.utils.defaultAbiCoder.encode(
    //         ['address', 'uint256', 'uint256', 'bool', 'address', 'address', 'address'],
    //         [
    //           user.address,
    //           BASE_PARAMS,
    //           ETHORACLEUSD.mul(UNIT_DAI),
    //           false,
    //           agEUR.address,
    //           DAI.address,
    //           ethers.constants.AddressZero,
    //         ],
    //       ),
    //     ];
    //     await (await angleRouter.connect(user).mixer([], transfers, swaps, actions, datas, { value: UNIT_ETH })).wait();

    //     // BALANCE_ETH = BALANCE_ETH.sub(UNIT_ETH).sub(tx.gasUsed);
    //     // expect(await ethers.provider.getBalance(user.address)).to.be.equal(BALANCE_ETH);
    //     const expectedEURVal = ETHORACLEUSD.mul(UNIT_DAI);
    //     BALANCE_AGEUR = BALANCE_AGEUR.add(expectedEURVal);
    //     expect(await agEUR.balanceOf(user.address)).to.be.equal(userAgEURbalancePre.add(expectedEURVal));
    //     await invariantFunds(angleRouter.address);
    //     await invariantFunds(cleanAddress.address);
    //   });
    // });
    // describe('openPerpetual', () => {
    //   it('success - open', async () => {
    //     const transfers: TypeTransfer[] = [];
    //     const swaps: TypeSwap[] = [
    //       {
    //         inToken: wETH.address,
    //         collateral: DAI.address,
    //         amountIn: UNIT_ETH.div(BigNumber.from(2)),
    //         minAmountOut: parseAmount.ether(ETHORACLEUSD).div(BigNumber.from(2)),
    //         args: '0x',
    //         swapType: SwapType.UniswapV3,
    //       },
    //     ];
    //     const actions = [ActionType.openPerpetual];
    //     const datas: string[] = [
    //       ethers.utils.defaultAbiCoder.encode(
    //         ['address', 'uint256', 'uint256', 'uint256', 'uint256', 'bool', 'address', 'address'],
    //         [
    //           user.address,
    //           BASE_PARAMS,
    //           parseAmount.ether(ETHORACLEUSD).div(BigNumber.from(2)),
    //           parseAmount.ether(DAIORACLEUSD),
    //           ethers.constants.Zero,
    //           false,
    //           agEUR.address,
    //           DAI.address,
    //         ],
    //       ),
    //     ];
    //     await (await angleRouter.connect(user).mixer([], transfers, swaps, actions, datas, { value: UNIT_ETH })).wait();

    //     // BALANCE_ETH = BALANCE_ETH.sub(UNIT_ETH.div(BigNumber.from(2))).sub(tx.gasUsed);
    //     // expect(await ethers.provider.getBalance(user.address)).to.be.equal(BALANCE_ETH);
    //     const perpData = await perpEURDAI.perpetualData(BigNumber.from(1));
    //     expect(await perpData.margin).to.be.equal(ETHORACLEUSD.mul(UNIT_DAI).div(BigNumber.from(2)));
    //     expect(await perpData.committedAmount).to.be.equal(ETHORACLEUSD.mul(UNIT_DAI).div(BigNumber.from(2)));
    //     expect(await perpData.entryRate).to.be.equal(parseAmount.ether(DAIORACLEUSD));
    //     await invariantFunds(angleRouter.address);
    //     await invariantFunds(cleanAddress.address);
    //   });
    // });
    // describe('addToPerpetual', () => {
    //   it('success - swap', async () => {
    //     const transfers: TypeTransfer[] = [
    //       { inToken: DAI.address, amountIn: parseAmount.ether(ETHORACLEUSD).div(BigNumber.from(4)) },
    //     ];
    //     const swaps: TypeSwap[] = [
    //       {
    //         inToken: wETH.address,
    //         collateral: DAI.address,
    //         amountIn: UNIT_ETH.div(BigNumber.from(4)),
    //         minAmountOut: parseAmount.ether(ETHORACLEUSD).div(BigNumber.from(4)),
    //         args: '0x',
    //         swapType: SwapType.UniswapV3,
    //       },
    //     ];
    //     const actions = [ActionType.addToPerpetual];
    //     const datas: string[] = [
    //       ethers.utils.defaultAbiCoder.encode(
    //         ['uint256', 'uint256', 'bool', 'address', 'address'],
    //         [BASE_PARAMS, BigNumber.from(1), false, agEUR.address, DAI.address],
    //       ),
    //     ];
    //     await (
    //       await angleRouter
    //         .connect(user)
    //         .mixer([], transfers, swaps, actions, datas, { value: UNIT_ETH.div(BigNumber.from(4)) })
    //     ).wait();

    //     // BALANCE_ETH = BALANCE_ETH.sub(UNIT_ETH.div(BigNumber.from(4))).sub(tx.gasUsed);
    //     // expect(await ethers.provider.getBalance(user.address)).to.be.equal(BALANCE_ETH);
    //     BALANCE_DAI = BALANCE_DAI.sub(parseAmount.ether(ETHORACLEUSD).div(BigNumber.from(4)));

    //     const perpData = await perpEURDAI.perpetualData(BigNumber.from(1));
    //     expect(await perpData.margin).to.be.equal(ETHORACLEUSD.mul(UNIT_DAI));
    //     expect(await perpData.committedAmount).to.be.equal(ETHORACLEUSD.mul(UNIT_DAI).div(BigNumber.from(2)));
    //     expect(await perpData.entryRate).to.be.equal(parseAmount.ether(DAIORACLEUSD));
    //     await invariantFunds(angleRouter.address);
    //     await invariantFunds(cleanAddress.address);
    //   });
    // });
  });
});
