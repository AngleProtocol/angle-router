import hre, { ethers, network, web3 } from 'hardhat';
import { BigNumber, Contract } from 'ethers';
import { parseAmount, multBy10e15 } from './bignumber';

import {
  AngleRouter,
  MockANGLE,
  MockOracle,
  MockTokenPermit,
  MockUniswapV3Router,
  Mock1Inch,
  MockWETH,
  MockANGLE__factory,
  MockUniswapV3Router__factory,
  Mock1Inch__factory,
  MockWETH__factory,
  MockTokenPermit__factory,
  MockOracle__factory,
} from '../typechain';

import {
  AgToken,
  Core,
  ERC20,
  PoolManager,
  FeeManager,
  PerpetualManagerFront,
  SanToken,
  VeANGLE,
  AngleDistributor,
  GaugeController,
  LiquidityGaugeV4,
  VeBoostProxy,
  SmartWalletWhitelist,
  FeeDistributor,
  StableMasterFront,
  ANGLE,
  Core__factory,
  VeANGLE__factory,
  VeBoost__factory,
  VeBoostProxy__factory,
  SmartWalletChecker__factory,
  SmartWalletWhitelist__factory,
  GaugeController__factory,
  AngleDistributor__factory,
  StableMaster__factory,
  AgToken__factory,
  FeeDistributor__factory,
  LiquidityGaugeV4__factory,
  PoolManager__factory,
  SanToken__factory,
  PerpetualManager__factory,
  FeeManager__factory,
  PerpetualManagerFront__factory,
  StableMasterFront__factory,
} from '../typechain/core';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from './chai-setup';

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

  const core = (await new Core__factory(governor).deploy(governor.address, guardian.address)) as unknown as Core;
  const ANGLE = (await new MockANGLE__factory(governor).deploy('ANGLE', 'ANGLE')) as MockANGLE;
  const smartWalletChecker = (await new SmartWalletWhitelist__factory(governor).deploy(
    governor.address,
  )) as unknown as SmartWalletWhitelist;
  const veANGLE = (await new VeANGLE__factory(governor).deploy()) as unknown as VeANGLE;
  await veANGLE.initialize(governor.address, ANGLE.address, smartWalletChecker.address, 'veANGLE', 'veANGLE');
  const veBoostProxy = (await new VeBoostProxy__factory(governor).deploy(
    veANGLE.address,
    ethers.constants.AddressZero,
    governor.address,
  )) as unknown as VeBoostProxy;
  const gaugeController = (await new GaugeController__factory(governor).deploy(
    ANGLE.address,
    veANGLE.address,
    governor.address,
  )) as unknown as GaugeController;
  const angleDistributor = (await new AngleDistributor__factory(governor).deploy()) as unknown as AngleDistributor;
  await angleDistributor.initialize(
    ANGLE.address,
    gaugeController.address,
    initInflationRate,
    0,
    governor.address,
    guardian.address,
    guardian.address,
  );
  const stableMaster = (await new StableMasterFront__factory(governor).deploy()) as unknown as StableMasterFront;
  await stableMaster.initialize(core.address);
  const agToken = (await new AgToken__factory(governor).deploy()) as unknown as AgToken;
  await agToken.initialize('agEUR', 'agEUR', stableMaster.address);

  await (await core.connect(governor).deployStableMaster(agToken.address)).wait();

  return { core, ANGLE, veANGLE, veBoostProxy, gaugeController, angleDistributor, stableMaster, agToken };
}

export async function initRouter(
  governor: SignerWithAddress,
  guardian: SignerWithAddress,
  stableMaster: StableMasterFront,
  poolManagers: PoolManager[],
  gauges: LiquidityGaugeV4[],
  tokenA: ERC20 | MockTokenPermit,
  tokenB: ERC20 | MockTokenPermit,
  tokenC: ERC20 | MockTokenPermit,
  oracleUni: BigNumber,
  oracle1Inch: BigNumber,
): Promise<{
  angleRouter: AngleRouter;
  uniswapRouter: MockUniswapV3Router;
  oneInchRouter: Mock1Inch;
}> {
  const uniswapRouter = (await new MockUniswapV3Router__factory(governor).deploy(
    tokenA.address,
    tokenC.address,
  )) as MockUniswapV3Router;
  await uniswapRouter.updateExchangeRate(parseAmount.ether(oracleUni));
  const oneInchRouter = (await new Mock1Inch__factory(governor).deploy(tokenB.address, tokenC.address)) as Mock1Inch;
  await oneInchRouter.updateExchangeRate(parseAmount.ether(oracle1Inch));

  const AngleRouterArtifacts = await ethers.getContractFactory('AngleRouter');
  const angleRouter = (await AngleRouterArtifacts.deploy()) as unknown as AngleRouter;
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
  const feeDistributor = (await new FeeDistributor__factory(governor).deploy(
    veANGLE.address,
    curTs,
    rewardToken,
    governor.address,
    governor.address,
  )) as unknown as FeeDistributor;
  return { feeDistributor };
}

export async function initWETH(
  name: string,
  decimals = BigNumber.from('18'),
  governor: SignerWithAddress,
): Promise<{
  token: MockWETH;
}> {
  const token = (await new MockWETH__factory(governor).deploy(name, name, decimals)) as MockWETH;
  return { token };
}

export async function initToken(
  name: string,
  decimals = BigNumber.from('18'),
  governor: SignerWithAddress,
): Promise<{
  token: MockTokenPermit;
}> {
  const token = (await new MockTokenPermit__factory(governor).deploy(name, name, decimals)) as MockTokenPermit;
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
  const gauge = (await new LiquidityGaugeV4__factory(governor).deploy()) as LiquidityGaugeV4;
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
  const gauge = (await new LiquidityGaugeV4__factory(governor).deploy()) as LiquidityGaugeV4;
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
  const token = (await new MockTokenPermit__factory(governor).deploy(name, name, collatBase)) as MockTokenPermit;
  const oracle = (await new MockOracle__factory(governor).deploy(
    oracleValue.mul(BASE_ORACLE),
    collatBase,
  )) as MockOracle;
  const manager = (await new PoolManager__factory(governor).deploy()) as unknown as PoolManager;

  await manager.initialize(token.address, stableMaster.address);
  const sanName = `san_${name}`;
  const sanToken = (await new SanToken__factory(governor).deploy()) as unknown as SanToken;
  await sanToken.initialize(sanName, sanName, manager.address);
  const perpetualManager = (await new PerpetualManagerFront__factory(
    governor,
  ).deploy()) as unknown as PerpetualManagerFront;
  await perpetualManager.initialize(manager.address, ANGLE.address);
  const feeManager = (await new FeeManager__factory(governor).deploy(manager.address)) as unknown as FeeManager;

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

export async function expectApproxDelta(actual: BigNumber, expected: BigNumber, delta: BigNumber): Promise<void> {
  const margin = expected.div(delta);
  expect(expected.lte(actual.add(margin)));
  expect(expected.gte(actual.sub(margin)));
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
  borrower,
}
export enum SwapType {
  UniswapV3,
  oneINCH,
  WrapStETH,
  None,
}
