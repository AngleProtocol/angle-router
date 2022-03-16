import { ethers, network, web3 } from 'hardhat';
import { expect } from '../../utils/chai-setup';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Interfaces, BASE_18, parseAmount } from '@angleprotocol/sdk';

// we import our utilities
import {
  // functions
  initAngle,
  initRouter,
  initCollateral,
  initToken,
  initGauge,
  initFeeDistributor,
  WEEK,
  TypeSwap,
  TypeTransfer,
  TypePermit,
  ActionType,
  SwapType,
  BASE_PARAMS,
} from '../../utils/helpers';

import {
  AngleRouter,
  MockANGLE,
  MockTokenPermit,
  Mock1Inch,
  MockVaultManager,
  MockVaultManager__factory,
} from '../../typechain';

import {
  AgToken,
  AngleDistributor,
  FeeDistributor,
  LiquidityGaugeV4,
  PerpetualManagerFront,
  PoolManager,
  SanToken,
  StableMasterFront,
  VeANGLE,
  VeBoostProxy,
} from '../../typechain/core';

import { addCollateral, createVault, mixer } from '../../utils/helpersEncoding';

let ANGLE: MockANGLE;
let veANGLE: VeANGLE;
let veBoostProxy: VeBoostProxy;
let angleDistributor: AngleDistributor;
let stableMasterEUR: StableMasterFront;
let agEUR: AgToken;

let angleRouter: AngleRouter;
let oneInchRouter: Mock1Inch;

let USDC: MockTokenPermit;
let wETH: MockTokenPermit;

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

let gaugeEUR: LiquidityGaugeV4;
let interestDistributorSanwBTCEUR: FeeDistributor;
let interestDistributorAgEUR: FeeDistributor;

let deployer: SignerWithAddress;
let guardian: SignerWithAddress;
let user: SignerWithAddress;
let cleanAddress: SignerWithAddress;
let governor: SignerWithAddress;
let treasury: SignerWithAddress;

let UNIT_ETH: BigNumber;
let UNIT_USDC: BigNumber;
let UNIT_WBTC: BigNumber;
let UNIT_DAI: BigNumber;
let BALANCE_AGEUR: BigNumber;
let BALANCE_ETH: BigNumber;
let BALANCE_USDC: BigNumber;
let BALANCE_WBTC: BigNumber;
let BALANCE_DAI: BigNumber;
let BALANCE_gaugeSanWBTC: BigNumber;
let BALANCE_gaugeSanWBTC2: BigNumber;
let BALANCE_gaugeSanDAI: BigNumber;
let BALANCE_sanWBTC: BigNumber;
let BALANCE_sanDAI: BigNumber;
let BALANCE_ANGLE: BigNumber;
let BALANCE_GOV_WBTC: BigNumber;
let ETHORACLEUSD: BigNumber;
let wBTCORACLEUSD: BigNumber;
let USDCORACLEUSD: BigNumber;
let DAIORACLEUSD: BigNumber;
let ETHdecimal: BigNumber;
let USDCdecimal: BigNumber;
let wBTCdecimal: BigNumber;
let DAIdecimal: BigNumber;

let REWARD_SANWBTC: BigNumber;
let REWARD_AGEUR: BigNumber;
const REWARD_ANGLE: BigNumber = parseAmount.ether(1000);

let oneInch: Mock1Inch;

export async function invariantFunds(owner: string): Promise<void> {
  expect(await agEUR.balanceOf(owner)).to.be.equal(ethers.constants.Zero);
  expect(await wBTC.balanceOf(owner)).to.be.equal(ethers.constants.Zero);
  expect(await DAI.balanceOf(owner)).to.be.equal(ethers.constants.Zero);
  expect(await USDC.balanceOf(owner)).to.be.equal(ethers.constants.Zero);
  expect(await wETH.balanceOf(owner)).to.be.equal(ethers.constants.Zero);
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
  expect(await wETH.balanceOf(user.address)).to.be.equal(BALANCE_ETH);
  expect(await sanTokenDAI.balanceOf(user.address)).to.be.equal(BALANCE_sanDAI);
  expect(await sanTokenWBTC.balanceOf(user.address)).to.be.equal(BALANCE_sanWBTC);
  expect(await gaugeSanEURDAI.balanceOf(user.address)).to.be.equal(BALANCE_gaugeSanDAI);
  expect(await gaugeSanEURWBTC.balanceOf(user.address)).to.be.equal(BALANCE_gaugeSanWBTC);
  expect(await gaugeSanEURWBTC2.balanceOf(user.address)).to.be.equal(BALANCE_gaugeSanWBTC2);
  expect(await ANGLE.balanceOf(user.address)).to.be.equal(BALANCE_ANGLE);

  expect(await DAI.allowance(user.address, angleRouter.address)).to.be.equal(BigNumber.from(0));
  expect(await wBTC.allowance(user.address, angleRouter.address)).to.be.equal(BigNumber.from(0));
  expect(await wETH.allowance(user.address, angleRouter.address)).to.be.equal(BigNumber.from(0));
  expect(await USDC.allowance(user.address, angleRouter.address)).to.be.equal(BigNumber.from(0));
  expect(await sanTokenDAI.allowance(user.address, angleRouter.address)).to.be.equal(BigNumber.from(0));
  expect(await sanTokenWBTC.allowance(user.address, angleRouter.address)).to.be.equal(BigNumber.from(0));
  // expect(await veANGLE['balanceOf(address)'](user.address)).to.be.equal(ethers.constants.Zero);
}

// Testing Angle Router
describe('AngleRouter01 - borrower', () => {
  before(async () => {
    [deployer, guardian, user, governor, cleanAddress, treasury] = await ethers.getSigners();

    ETHdecimal = BigNumber.from('18');
    USDCdecimal = BigNumber.from('6');
    wBTCdecimal = BigNumber.from('8');
    DAIdecimal = BigNumber.from('18');

    ETHORACLEUSD = BigNumber.from('2');
    wBTCORACLEUSD = BigNumber.from('30');
    USDCORACLEUSD = BigNumber.from('1');
    DAIORACLEUSD = BigNumber.from('1');

    ({ token: wETH } = await initToken('wETH', ETHdecimal, governor));
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
    ({ gauge: gaugeEUR } = await initGauge(agEUR.address, governor, ANGLE, veANGLE, veBoostProxy));

    ({ feeDistributor: interestDistributorSanwBTCEUR } = await initFeeDistributor(
      veANGLE,
      sanTokenWBTC.address,
      governor,
    ));
    ({ feeDistributor: interestDistributorAgEUR } = await initFeeDistributor(veANGLE, agEUR.address, governor));

    ({ angleRouter, oneInchRouter } = await initRouter(
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

    oneInch = new ethers.Contract(oneInchRouter.address, Interfaces.OneInchAggregatorV4) as Mock1Inch;

    const VaultManagerA = (await new MockVaultManager__factory(governor).deploy(treasury.address)) as MockVaultManager;
    const VaultManagerB = (await new MockVaultManager__factory(governor).deploy(treasury.address)) as MockVaultManager;

    // Mint tokens of all type to user
    UNIT_ETH = BigNumber.from(10).pow(ETHdecimal);
    UNIT_USDC = BigNumber.from(10).pow(USDCdecimal);
    UNIT_WBTC = BigNumber.from(10).pow(wBTCdecimal);
    UNIT_DAI = BigNumber.from(10).pow(DAIdecimal);
    BALANCE_AGEUR = ethers.constants.Zero;
    BALANCE_ETH = BigNumber.from(50).mul(BigNumber.from(10).pow(ETHdecimal));
    BALANCE_USDC = BigNumber.from(50).mul(BigNumber.from(10).pow(USDCdecimal));
    BALANCE_WBTC = BigNumber.from(50).mul(BigNumber.from(10).pow(wBTCdecimal));
    BALANCE_DAI = BigNumber.from(50).mul(BigNumber.from(10).pow(DAIdecimal));
    BALANCE_gaugeSanDAI = BigNumber.from(0);
    BALANCE_gaugeSanWBTC2 = BigNumber.from(0);
    BALANCE_gaugeSanWBTC = BigNumber.from(0);
    BALANCE_sanDAI = BigNumber.from(0);
    BALANCE_sanWBTC = BigNumber.from(0);
    BALANCE_GOV_WBTC = BigNumber.from(50).mul(BigNumber.from(10).pow(wBTCdecimal));
    BALANCE_ANGLE = BigNumber.from(1_000_000).mul(BASE_18);

    await (await wBTC.connect(governor).mint(user.address, BALANCE_WBTC)).wait();
    await (await wETH.connect(governor).mint(user.address, BALANCE_ETH)).wait();
    await (await USDC.connect(governor).mint(user.address, BALANCE_USDC)).wait();
    await (await DAI.connect(governor).mint(user.address, BALANCE_DAI)).wait();
    await (await ANGLE.connect(governor).mint(user.address, BALANCE_ANGLE)).wait();
    await (await wBTC.connect(governor).mint(governor.address, BALANCE_GOV_WBTC)).wait();

    await (await wBTC.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await sanTokenWBTC.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await sanTokenDAI.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();

    await (await wETH.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await USDC.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await DAI.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await ANGLE.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await wETH.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();

    // set the rewardDistribution to be the governor
    await (await perpEURWBTC.connect(guardian).setRewardDistribution(WEEK, governor.address)).wait();
    await (await perpEURDAI.connect(guardian).setRewardDistribution(WEEK, governor.address)).wait();
  });

  describe('Borrower test', () => {
    describe('Decoding test', () => {
      it('read', async () => {
        const calls = [createVault(user.address), createVault(user.address), addCollateral(2, UNIT_DAI)];

        await mixer(angleRouter, user, [], [], [], calls);
      });
    });
  });
});
