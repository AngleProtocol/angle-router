import hre, { ethers, network, web3 } from 'hardhat';
import { BigNumber, Contract } from 'ethers';
import { parseAmount, multBy10e15 } from './bignumber';

import {
  //   AgToken,
  Core,
  PoolManager,
  FeeManager,
  MockANGLE,
  MockOracle,
  MockTokenPermit,
  PerpetualManagerFront,
  SanToken,
  StableMasterFront,
  VeANGLE,
  AngleDistributor,
  GaugeController,
  LiquidityGaugeV4,
  VeBoostProxy,
  SmartWalletWhitelist,
  AngleRouter,
  MockUniswapV3Router,
  ERC20,
  StableMaster,
  FeeDistributor,
  Mock1Inch,
  MockWETH,
  ANGLE,
} from '@angleprotocol/sdk/dist/constants/types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from './chai-setup';
import { AgToken } from '@angleprotocol/sdk/dist/constants/types';

export const BASE = parseAmount.ether(1);
export const BASE_PARAMS = parseAmount.gwei(1);
export const BASE_15 = multBy10e15(15);
export const BASE_RATE = BigNumber.from(10 ** 2);
export const BASE_ORACLE = parseAmount.ether(1);
export const REWARD_AMOUNT = parseAmount.ether(1);
export const HOUR = 3600;
export const DAY = HOUR * 24;
export const WEEK = DAY * 7;

export const MAX_MINT_AMOUNT = BigNumber.from(2).pow(BigNumber.from(256)).sub(BigNumber.from(1));

export type TypePermit = {
  token: string;
  owner: string;
  value: BigNumber;
  deadline: number;
  v: number;
  r: Buffer;
  s: Buffer;
};

export type TypeSwap = {
  inToken: string;
  collateral: string;
  amountIn: BigNumber;
  minAmountOut: BigNumber;
  args: string;
  swapType: number;
};

export type TypeTransfer = {
  inToken: string;
  amountIn: BigNumber;
};

export async function setupUsers<T extends { [contractName: string]: Contract }>(
  addresses: string[],
  contracts: T,
): Promise<({ address: string } & T)[]> {
  const users: ({ address: string } & T)[] = [];
  for (const address of addresses) {
    users.push(await setupUser(address, contracts));
  }
  return users;
}

export async function setupUser<T extends { [contractName: string]: Contract }>(
  address: string,
  contracts: T,
): Promise<{ address: string } & T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user: any = { address };
  for (const key of Object.keys(contracts)) {
    user[key] = contracts[key].connect(await ethers.getSigner(address));
  }
  return user as { address: string } & T;
}

export async function initAngle(
  governor: SignerWithAddress,
  guardian: SignerWithAddress,
): Promise<{
  core: Core;
  ANGLE: MockANGLE;
  veANGLE: VeANGLE;
  veBoostProxy: VeBoostProxy;
  gaugeController: GaugeController;
  angleDistributor: AngleDistributor;
  stableMaster: StableMasterFront;
  agToken: AgToken;
}> {
  const initInflationRate = BigNumber.from('5').pow(BigNumber.from('10'));

  const CoreArtifacts = await ethers.getContractFactory('Core');
  const MockANGLEArtifacts = await ethers.getContractFactory('MockANGLE');
  const veANGLEArtifacts = await ethers.getContractFactory('veANGLE');
  const veBoostProxyArtifacts = await ethers.getContractFactory('veBoostProxy');
  const smartWalletCheckerArtifacts = await ethers.getContractFactory('SmartWalletWhitelist');
  const gaugeControllerArtifacts = await ethers.getContractFactory('GaugeController');
  const angleDistributorArtifacts = await ethers.getContractFactory('AngleDistributor');
  const AgTokenArtifacts = await ethers.getContractFactory('AgToken');
  const StableMasterArtifacts = await ethers.getContractFactory('StableMasterFront');

  const core = (await CoreArtifacts.deploy(governor.address, guardian.address)) as Core;
  const ANGLE = (await MockANGLEArtifacts.deploy('ANGLE', 'ANGLE')) as MockANGLE;
  const smartWalletChecker = (await smartWalletCheckerArtifacts.deploy(governor.address)) as SmartWalletWhitelist;
  const veANGLE = (await veANGLEArtifacts.deploy()) as VeANGLE;
  await veANGLE.initialize(governor.address, ANGLE.address, smartWalletChecker.address, 'veANGLE', 'veANGLE');
  const veBoostProxy = (await veBoostProxyArtifacts.deploy(
    veANGLE.address,
    ethers.constants.AddressZero,
    governor.address,
  )) as VeBoostProxy;
  const gaugeController = (await gaugeControllerArtifacts.deploy(
    ANGLE.address,
    veANGLE.address,
    governor.address,
  )) as GaugeController;
  const angleDistributor = (await angleDistributorArtifacts.deploy()) as AngleDistributor;
  await angleDistributor.initialize(
    ANGLE.address,
    gaugeController.address,
    initInflationRate,
    0,
    governor.address,
    guardian.address,
    guardian.address,
  );
  const stableMaster = (await StableMasterArtifacts.deploy()) as StableMasterFront;
  await stableMaster.initialize(core.address);
  const agToken = (await AgTokenArtifacts.deploy()) as AgToken;
  await agToken.initialize('agEUR', 'agEUR', stableMaster.address);

  await (await core.connect(governor).deployStableMaster(agToken.address)).wait();

  return { core, ANGLE, veANGLE, veBoostProxy, gaugeController, angleDistributor, stableMaster, agToken };
}

export async function initRouter(
  governor: SignerWithAddress,
  guardian: SignerWithAddress,
  stableMaster: StableMaster,
  poolManagers: PoolManager[],
  gauges: LiquidityGaugeV4[],
  tokenA: ERC20,
  tokenB: ERC20,
  tokenC: ERC20,
  oracleUni: BigNumber,
  oracle1Inch: BigNumber,
): Promise<{
  angleRouter: AngleRouter;
  uniswapRouter: MockUniswapV3Router;
  oneInchRouter: Mock1Inch;
}> {
  const MockUniswapV3Router = await ethers.getContractFactory('MockUniswapV3Router');
  const uniswapRouter = (await MockUniswapV3Router.deploy(tokenA.address, tokenC.address)) as MockUniswapV3Router;
  await uniswapRouter.updateExchangeRate(parseAmount.ether(oracleUni));
  const Mock1InchRouter = await ethers.getContractFactory('Mock1Inch');
  const oneInchRouter = (await Mock1InchRouter.deploy(tokenB.address, tokenC.address)) as Mock1Inch;
  await oneInchRouter.updateExchangeRate(parseAmount.ether(oracle1Inch));

  const AngleRouterArtifacts = await ethers.getContractFactory('AngleRouter');
  const angleRouter = (await AngleRouterArtifacts.deploy()) as AngleRouter;
  await angleRouter.initialize(
    governor.address,
    guardian.address,
    uniswapRouter.address,
    oneInchRouter.address,
    stableMaster.address,
    poolManagers.map(pool => pool.address),
    gauges.map(gauge => gauge.address),
  );

  return { angleRouter, uniswapRouter, oneInchRouter };
}

export async function initFeeDistributor(
  veANGLE: VeANGLE,
  rewardToken: string,
  governor: SignerWithAddress,
): Promise<{
  feeDistributor: FeeDistributor;
}> {
  const curTs = await (await web3.eth.getBlock('latest')).timestamp;
  const FeeDistributorArtifacts = await ethers.getContractFactory('FeeDistributor');
  const feeDistributor = (await FeeDistributorArtifacts.deploy(
    veANGLE.address,
    curTs,
    rewardToken,
    governor.address,
    governor.address,
  )) as FeeDistributor;
  return { feeDistributor };
}

export async function initWETH(
  name: string,
  decimals = BigNumber.from('18'),
): Promise<{
  token: MockWETH;
}> {
  const MockWETHArtifacts = await ethers.getContractFactory('MockWETH');
  const token = (await MockWETHArtifacts.deploy(name, name, decimals)) as MockWETH;
  return { token };
}

export async function initToken(
  name: string,
  decimals = BigNumber.from('18'),
): Promise<{
  token: MockTokenPermit;
}> {
  const MockTokenArtifacts = await ethers.getContractFactory('MockTokenPermit');
  const token = (await MockTokenArtifacts.deploy(name, name, decimals)) as MockTokenPermit;
  return { token };
}

export async function initGauge(
  stakedToken: string,
  governor: SignerWithAddress,
  ANGLE: MockANGLE,
  veANGLE: VeANGLE,
  veBoostProxy: VeBoostProxy,
): Promise<{
  gauge: LiquidityGaugeV4;
}> {
  const LiquidityGaugeArtifacts = await ethers.getContractFactory('LiquidityGaugeV4');
  const gauge = (await LiquidityGaugeArtifacts.deploy()) as LiquidityGaugeV4;
  await gauge.initialize(
    stakedToken,
    governor.address,
    ANGLE.address,
    veANGLE.address,
    veBoostProxy.address,
    // governor address instead of the angle distributor for testing purpose
    governor.address,
  );

  await (await ANGLE.connect(governor).mint(governor.address, REWARD_AMOUNT)).wait();
  // deposit directly rewards tokens for testing purpose
  await (await ANGLE.connect(governor).approve(gauge.address, ethers.constants.MaxUint256)).wait();
  await (await gauge.connect(governor).deposit_reward_token(ANGLE.address, REWARD_AMOUNT)).wait();
  expect(await ANGLE.balanceOf(gauge.address)).to.be.equal(REWARD_AMOUNT);

  return { gauge };
}

export async function initGaugeFork(
  stakedToken: string,
  governor: SignerWithAddress,
  ANGLE: ANGLE,
  veANGLE: VeANGLE,
  veBoostProxy: VeBoostProxy,
): Promise<{
  gauge: LiquidityGaugeV4;
}> {
  const LiquidityGaugeArtifacts = await ethers.getContractFactory('LiquidityGaugeV4');
  const gauge = (await LiquidityGaugeArtifacts.deploy()) as LiquidityGaugeV4;
  await gauge.initialize(
    stakedToken,
    governor.address,
    ANGLE.address,
    veANGLE.address,
    veBoostProxy.address,
    // governor address instead of the angle distributor for testing purpose
    governor.address,
  );
  // deposit directly rewards tokens for testing purpose
  await (await ANGLE.connect(governor).approve(gauge.address, ethers.constants.MaxUint256)).wait();
  await (await gauge.connect(governor).deposit_reward_token(ANGLE.address, REWARD_AMOUNT)).wait();
  expect(await ANGLE.balanceOf(gauge.address)).to.be.equal(REWARD_AMOUNT);

  return { gauge };
}

export async function initCollateral(
  name: string,
  stableMaster: StableMasterFront,
  ANGLE: MockANGLE,
  governor: SignerWithAddress,
  collatBase = BigNumber.from('18'),
  oracleValue = BigNumber.from('1'),
  // if 0 no fees / 1 constant fees / 2 dynamic fees
  initFees = 0,
  updateFees = true,
): Promise<{
  token: MockTokenPermit;
  oracle: MockOracle;
  manager: PoolManager;
  sanToken: SanToken;
  perpetualManager: PerpetualManagerFront;
  feeManager: FeeManager;
}> {
  const SanTokenArtifacts = await ethers.getContractFactory('SanToken');
  const PoolManagerArtifacts = await ethers.getContractFactory('PoolManager');
  const PerpetualManagerArtifacts = await ethers.getContractFactory('PerpetualManagerFront');
  const FeeManagerArtifacts = await ethers.getContractFactory('FeeManager');
  const MockOracleArtifacts = await ethers.getContractFactory('MockOracle');
  const MockTokenArtifacts = await ethers.getContractFactory('MockTokenPermit');

  const token = (await MockTokenArtifacts.deploy(name, name, collatBase)) as MockTokenPermit;
  const oracle = (await MockOracleArtifacts.deploy(oracleValue.mul(BASE_ORACLE), collatBase)) as MockOracle;
  const manager = (await PoolManagerArtifacts.deploy()) as PoolManager;

  await manager.initialize(token.address, stableMaster.address);
  const sanName = `san_${name}`;
  const sanToken = (await SanTokenArtifacts.deploy()) as SanToken;
  await sanToken.initialize(sanName, sanName, manager.address);
  const perpetualManager = (await PerpetualManagerArtifacts.deploy()) as PerpetualManagerFront;
  await perpetualManager.initialize(manager.address, ANGLE.address);
  const feeManager = (await FeeManagerArtifacts.deploy(manager.address)) as FeeManager;

  await (
    await stableMaster
      .connect(governor)
      .deployCollateral(manager.address, perpetualManager.address, feeManager.address, oracle.address, sanToken.address)
  ).wait();

  if (initFees === 0) {
    // for test purpose
    const xFeeMint = [parseAmount.gwei(0)];
    const yFeeMint = [parseAmount.gwei(0)];
    await stableMaster.connect(governor).setUserFees(manager.address, xFeeMint, yFeeMint, 1);

    const xFeeBurn = [parseAmount.gwei(0)];
    const yFeeBurn = [parseAmount.gwei(0)];
    await stableMaster.connect(governor).setUserFees(manager.address, xFeeBurn, yFeeBurn, 0);

    const xHAFeesDeposit = [parseAmount.gwei(0)];
    const yHAFeesDeposit = [parseAmount.gwei(0)];
    await perpetualManager.connect(governor).setHAFees(xHAFeesDeposit, yHAFeesDeposit, 1);

    const xHAFeesWithdraw = [parseAmount.gwei(0.0)];
    const yHAFeesWithdraw = [parseAmount.gwei(0.0)];
    await perpetualManager.connect(governor).setHAFees(xHAFeesWithdraw, yHAFeesWithdraw, 0);

    const xSlippage = [parseAmount.gwei(0)];
    const ySlippage = [parseAmount.gwei(0)];
    const xSlippageFee = [parseAmount.gwei(0)];
    const ySlippageFee = [parseAmount.gwei(0)];

    await feeManager.connect(governor).setFees(xSlippage, ySlippage, 3);
    await feeManager.connect(governor).setFees(xSlippageFee, ySlippageFee, 0);
  } else if (initFees === 1) {
    // for test purpose
    const xFeeMint = [parseAmount.gwei(0), parseAmount.gwei(1)];
    const yFeeMint = [parseAmount.gwei(0.1), parseAmount.gwei(0.1)];
    await stableMaster.connect(governor).setUserFees(manager.address, xFeeMint, yFeeMint, 1);

    const xFeeBurn = [parseAmount.gwei(0), parseAmount.gwei(1)];
    const yFeeBurn = [parseAmount.gwei(0.1), parseAmount.gwei(0.1)];
    await stableMaster.connect(governor).setUserFees(manager.address, xFeeBurn, yFeeBurn, 0);

    const xHAFeesDeposit = [parseAmount.gwei(0.1), parseAmount.gwei(0.4), parseAmount.gwei(0.7)];
    const yHAFeesDeposit = [parseAmount.gwei(0.01), parseAmount.gwei(0.01), parseAmount.gwei(0.01)];
    await perpetualManager.connect(governor).setHAFees(xHAFeesDeposit, yHAFeesDeposit, 1);

    const xHAFeesWithdraw = [parseAmount.gwei(0.1), parseAmount.gwei(0.4), parseAmount.gwei(0.7)];
    const yHAFeesWithdraw = [parseAmount.gwei(0.01), parseAmount.gwei(0.01), parseAmount.gwei(0.01)];
    await perpetualManager.connect(governor).setHAFees(xHAFeesWithdraw, yHAFeesWithdraw, 0);

    const xSlippage = [parseAmount.gwei(1), parseAmount.gwei(1.5)];
    const ySlippage = [parseAmount.gwei(1), parseAmount.gwei(0)];
    const xSlippageFee = [parseAmount.gwei(1), parseAmount.gwei(1.5)];
    const ySlippageFee = [parseAmount.gwei(1), parseAmount.gwei(0)];

    await feeManager.connect(governor).setFees(xSlippage, ySlippage, 3);
    await feeManager.connect(governor).setFees(xSlippageFee, ySlippageFee, 0);
  } else {
    const xFeeMint = [parseAmount.gwei('0'), parseAmount.gwei('0.4'), parseAmount.gwei('0.7'), parseAmount.gwei('1')];
    const yFeeMint = [
      parseAmount.gwei('0.08'),
      parseAmount.gwei('0.025'),
      parseAmount.gwei('0.005'),
      parseAmount.gwei('0.002'),
    ];
    await stableMaster.connect(governor).setUserFees(manager.address, xFeeMint, yFeeMint, 1);

    const xFeeBurn = [parseAmount.gwei('0'), parseAmount.gwei('0.3'), parseAmount.gwei('0.6'), parseAmount.gwei('1')];
    const yFeeBurn = [
      parseAmount.gwei('0.002'),
      parseAmount.gwei('0.003'),
      parseAmount.gwei('0.005'),
      parseAmount.gwei('0.015'),
    ];
    await stableMaster.connect(governor).setUserFees(manager.address, xFeeBurn, yFeeBurn, 0);

    const xHAFeesDeposit = [
      parseAmount.gwei('0'),
      parseAmount.gwei('0.4'),
      parseAmount.gwei('0.7'),
      parseAmount.gwei('1'),
    ];
    const yHAFeesDeposit = [
      parseAmount.gwei('0.002'),
      parseAmount.gwei('0.005'),
      parseAmount.gwei('0.01'),
      parseAmount.gwei('0.03'),
    ];
    await perpetualManager.connect(governor).setHAFees(xHAFeesDeposit, yHAFeesDeposit, 1);

    const xHAFeesWithdraw = [
      parseAmount.gwei('0'),
      parseAmount.gwei('0.4'),
      parseAmount.gwei('0.7'),
      parseAmount.gwei('1'),
    ];
    const yHAFeesWithdraw = [
      parseAmount.gwei('0.06'),
      parseAmount.gwei('0.02'),
      parseAmount.gwei('0.01'),
      parseAmount.gwei('0.002'),
    ];
    await perpetualManager.connect(governor).setHAFees(xHAFeesWithdraw, yHAFeesWithdraw, 0);

    const xSlippage = [
      parseAmount.gwei('0.5'),
      parseAmount.gwei('1'),
      parseAmount.gwei('1.2'),
      parseAmount.gwei('1.5'),
    ];
    const ySlippage = [
      parseAmount.gwei('0.5'),
      parseAmount.gwei('0.2'),
      parseAmount.gwei('0.1'),
      parseAmount.gwei('0'),
    ];
    const xSlippageFee = [
      parseAmount.gwei('0.5'),
      parseAmount.gwei('1'),
      parseAmount.gwei('1.2'),
      parseAmount.gwei('1.5'),
    ];
    const ySlippageFee = [
      parseAmount.gwei('0.75'),
      parseAmount.gwei('0.5'),
      parseAmount.gwei('0.15'),
      parseAmount.gwei('0'),
    ];

    await feeManager.connect(governor).setFees(xSlippage, ySlippage, 3);
    await feeManager.connect(governor).setFees(xSlippageFee, ySlippageFee, 0);
  }

  const xBonusMalusMint = [parseAmount.gwei('0.5'), parseAmount.gwei('1')];
  const yBonusMalusMint = [parseAmount.gwei('0.8'), parseAmount.gwei('1')];
  const xBonusMalusBurn = [
    parseAmount.gwei('0'),
    parseAmount.gwei('0.5'),
    parseAmount.gwei('1'),
    parseAmount.gwei('1.3'),
    parseAmount.gwei('1.5'),
  ];
  const yBonusMalusBurn = [
    parseAmount.gwei('10'),
    parseAmount.gwei('4'),
    parseAmount.gwei('1.5'),
    parseAmount.gwei('1'),
    parseAmount.gwei('1'),
  ];
  await feeManager.connect(governor).setFees(xBonusMalusMint, yBonusMalusMint, 1);
  await feeManager.connect(governor).setFees(xBonusMalusBurn, yBonusMalusBurn, 2);
  await feeManager.connect(governor).setHAFees(parseAmount.gwei('1'), parseAmount.gwei('1'));

  await stableMaster
    .connect(governor)
    .setIncentivesForSLPs(parseAmount.gwei('0.5'), parseAmount.gwei('0.5'), manager.address);
  await stableMaster
    .connect(governor)
    .setCapOnStableAndMaxInterests(
      parseAmount.ether('1000000000000'),
      parseAmount.ether('1000000000000'),
      manager.address,
    );

  // Limit HA hedge should always be set before the target HA hedge
  await perpetualManager.connect(governor).setTargetAndLimitHAHedge(parseAmount.gwei('0.9'), parseAmount.gwei('0.95'));
  await perpetualManager.connect(governor).setBoundsPerpetual(parseAmount.gwei('3'), parseAmount.gwei('0.0625'));
  await perpetualManager.connect(governor).setKeeperFeesLiquidationRatio(parseAmount.gwei('0.2'));
  await perpetualManager.connect(governor).setKeeperFeesCap(parseAmount.ether('100'), parseAmount.ether('100'));
  const xKeeperFeesClosing = [parseAmount.gwei('0.25'), parseAmount.gwei('0.5'), parseAmount.gwei('1')];
  const yKeeperFeesClosing = [parseAmount.gwei('0.1'), parseAmount.gwei('0.6'), parseAmount.gwei('1')];
  await perpetualManager.connect(governor).setKeeperFeesClosing(xKeeperFeesClosing, yKeeperFeesClosing);

  if (updateFees) {
    await feeManager.connect(governor).updateUsersSLP();
    await feeManager.connect(governor).updateHA();
  }

  await stableMaster
    .connect(governor)
    .unpause('0xfb286912c6eadba541f23a3bb3e83373ab139b6e65d84e2a473c186efc2b4642', manager.address);
  await stableMaster
    .connect(governor)
    .unpause('0xe0136b3661826a483734248681e4f59ae66bc6065ceb43fdd469ecb22c21d745', manager.address);
  await perpetualManager.connect(governor).unpause();

  return { token, oracle, manager, sanToken, perpetualManager, feeManager };
}

export function piecewiseFunction(value: BigNumber, xArray: BigNumber[], yArray: BigNumber[]): BigNumber {
  if (value.gte(xArray[xArray.length - 1])) return yArray[yArray.length - 1];
  if (value.lte(xArray[0])) return yArray[0];

  let i = 0;
  while (value.gte(xArray[i + 1])) {
    i += 1;
  }
  const pct = value
    .sub(xArray[i])
    .mul(BASE)
    .div(xArray[i + 1].sub(xArray[i]));
  const normalized = pct
    .mul(yArray[i + 1].sub(yArray[i]))
    .div(BASE)
    .add(yArray[i]);

  return normalized;
}

export async function impersonate(
  address: string,
  cb?: (_account: SignerWithAddress) => Promise<void>,
  stopImpersonating = true,
): Promise<SignerWithAddress> {
  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [address],
  });

  const account = await ethers.getSigner(address);
  if (cb) {
    await cb(account);
  }

  if (stopImpersonating) {
    await network.provider.request({
      method: 'hardhat_stopImpersonatingAccount',
      params: [address],
    });
  }
  return account;
}

export enum ActionType {
  claimRewards,
  claimWeeklyInterest,
  gaugeDeposit,
  withdraw,
  mint,
  deposit,
  openPerpetual,
  addToPerpetual,
  veANGLEDeposit,
}
export enum SwapType {
  UniswapV3,
  oneINCH,
}
