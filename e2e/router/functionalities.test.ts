import { ethers, network, web3 } from 'hardhat';
import { expect } from '../../utils/chai-setup';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

// we import our utilities
import {
  // functions
  initAngle,
  initRouter,
  initCollateral,
  initToken,
  initGauge,
  initFeeDistributor,
  DAY,
  WEEK,
  TypeSwap,
  TypeTransfer,
  TypePermit,
  ActionType,
  SwapType,
  BASE_PARAMS,
} from '../../utils/helpers';

import { AngleRouter, MockANGLE, MockTokenPermit } from '../../typechain';

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
import { BASE_18, ChainId, formatAmount, parseAmount } from '@angleprotocol/sdk';
import { expectApproxDelta } from '../../utils/helpers';
import { domainSeparator, signPermit } from '../../utils/sign';

let ANGLE: MockANGLE;
let veANGLE: VeANGLE;
let veBoostProxy: VeBoostProxy;
let angleDistributor: AngleDistributor;
let stableMasterEUR: StableMasterFront;
let agEUR: AgToken;

let angleRouter: AngleRouter;

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
let user2: SignerWithAddress;
let cleanAddress: SignerWithAddress;
let governor: SignerWithAddress;
let burner: SignerWithAddress;

let UNIT_ETH: BigNumber;
let UNIT_WBTC: BigNumber;
let UNIT_DAI: BigNumber;
let BALANCE_AGEUR: BigNumber;
let BALANCE_ETH: BigNumber;
let BALANCE_USDC: BigNumber;
let BALANCE_WBTC: BigNumber;
let BALANCE_DAI: BigNumber;
let BALANCE_ANGLE: BigNumber;
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

let REWARD_SANWBTC: BigNumber;
let REWARD_AGEUR: BigNumber;

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
  // expect(await sanTokenDAI.balanceOf(user.address)).to.be.equal();
  // expect(await sanTokenWBTC.balanceOf(user.address)).to.be.equal(ethers.constants.Zero);
  // expect(await gaugeSanEURDAI.balanceOf(user.address)).to.be.equal(ethers.constants.Zero);
  // expect(await gaugeSanEURWBTC.balanceOf(user.address)).to.be.equal(ethers.constants.Zero);
  // expect(await gaugeSanEURWBTC2.balanceOf(user.address)).to.be.equal(ethers.constants.Zero);
  // expect(await ANGLE.balanceOf(user.address)).to.be.equal();
  // expect(await veANGLE['balanceOf(address)'](user.address)).to.be.equal(ethers.constants.Zero);
}

// Testing Angle Router
describe('AngleRouter01 - functionalities', () => {
  before(async () => {
    [deployer, guardian, user, user2, governor, cleanAddress, burner] = await ethers.getSigners();

    ETHdecimal = BigNumber.from('18');
    USDCdecimal = BigNumber.from('6');
    wBTCdecimal = BigNumber.from('8');
    DAIdecimal = BigNumber.from('18');

    ETHORACLEUSD = BigNumber.from('2000');
    wBTCORACLEUSD = BigNumber.from('30000');
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

    // Mint tokens of all type to user
    UNIT_ETH = BigNumber.from(10).pow(ETHdecimal);
    UNIT_WBTC = BigNumber.from(10).pow(wBTCdecimal);
    UNIT_DAI = BigNumber.from(10).pow(DAIdecimal);
    BALANCE_AGEUR = ethers.constants.Zero;
    BALANCE_ETH = BigNumber.from(50).mul(BigNumber.from(10).pow(ETHdecimal));
    BALANCE_USDC = BigNumber.from(50).mul(BigNumber.from(10).pow(USDCdecimal));
    BALANCE_WBTC = BigNumber.from(50).mul(BigNumber.from(10).pow(wBTCdecimal));
    BALANCE_DAI = BigNumber.from(50).mul(BigNumber.from(10).pow(DAIdecimal));
    BALANCE_GOV_WBTC = BigNumber.from(50).mul(BigNumber.from(10).pow(wBTCdecimal));

    BALANCE_ANGLE = BigNumber.from(1_000_000).mul(BASE_18);
    BALANCE2_ANGLE = BigNumber.from(1_000_000).mul(BASE_18);

    await (await wBTC.connect(governor).mint(user.address, BALANCE_WBTC)).wait();
    await (await wETH.connect(governor).mint(user.address, BALANCE_ETH)).wait();
    await (await USDC.connect(governor).mint(user.address, BALANCE_USDC)).wait();
    await (await DAI.connect(governor).mint(user.address, BALANCE_DAI)).wait();
    await (await ANGLE.connect(governor).mint(user.address, BALANCE_ANGLE)).wait();
    await (await ANGLE.connect(governor).mint(user2.address, BALANCE2_ANGLE)).wait();
    await (await wBTC.connect(governor).mint(governor.address, BALANCE_GOV_WBTC)).wait();

    await (await wBTC.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await sanTokenWBTC.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await sanTokenDAI.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();

    await (await wETH.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await USDC.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await DAI.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await ANGLE.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
  });

  describe('Router Functionalities', () => {
    describe('User Approval - Balance', () => {
      it('revert - no approval', async () => {
        expect(await DAI.allowance(user.address, angleRouter.address)).to.be.equal(BigNumber.from(0));
        expect(await wBTC.allowance(user.address, angleRouter.address)).to.be.equal(BigNumber.from(0));
        expect(await wETH.allowance(user.address, angleRouter.address)).to.be.equal(BigNumber.from(0));
        expect(await USDC.allowance(user.address, angleRouter.address)).to.be.equal(BigNumber.from(0));

        const permits: TypePermit[] = [];

        const transfers: TypeTransfer[] = [{ inToken: DAI.address, amountIn: UNIT_DAI }];
        const swaps: TypeSwap[] = [
          {
            inToken: wETH.address,
            collateral: DAI.address,
            amountIn: UNIT_ETH,
            minAmountOut: UNIT_DAI.mul(ETHORACLEUSD),
            args: '0x',
            swapType: SwapType.UniswapV3,
          },
        ];

        const actions = [ActionType.openPerpetual];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'uint256', 'uint256', 'bool', 'address', 'address'],
            [
              user.address,
              UNIT_DAI.mul(BigNumber.from(2)),
              UNIT_DAI,
              DAIORACLEUSD.mul(BASE_18),
              BigNumber.from(0),
              false,
              agEUR.address,
              DAI.address,
            ],
          ),
        ];

        await expect(angleRouter.connect(user).mixer(permits, transfers, [], actions, datas)).to.be.revertedWith(
          'ERC20: transfer amount exceeds allowance',
        );
        await expect(angleRouter.connect(user).mixer(permits, [], swaps, actions, datas)).to.be.revertedWith(
          'ERC20: transfer amount exceeds allowance',
        );
      });
      it('domain separator', async function () {
        expect(await wETH.DOMAIN_SEPARATOR()).to.equal(await domainSeparator('wETH', wETH.address, '1', 1));
      });
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
            wETH.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
            angleRouter.address,
            ethers.constants.MaxUint256,
            'wETH',
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

        await (await angleRouter.connect(user).mixer(permits, transfers, swaps, actions, datas)).wait();

        expect(await DAI.nonces(user.address)).to.be.equal(BigNumber.from('1'));
        expect(await DAI.allowance(user.address, angleRouter.address)).to.be.equal(ethers.constants.MaxUint256);
        expect(await wETH.nonces(user.address)).to.be.equal(BigNumber.from('1'));
        expect(await wETH.allowance(user.address, angleRouter.address)).to.be.equal(ethers.constants.MaxUint256);
        expect(await wBTC.nonces(user.address)).to.be.equal(BigNumber.from('1'));
        expect(await wBTC.allowance(user.address, angleRouter.address)).to.be.equal(ethers.constants.MaxUint256);
        expect(await USDC.nonces(user.address)).to.be.equal(BigNumber.from('1'));
        expect(await USDC.allowance(user.address, angleRouter.address)).to.be.equal(ethers.constants.MaxUint256);
      });
      it('revert - exceeded number of tokens', async () => {
        // permits done before
        const permits: TypePermit[] = [];

        const transfers: TypeTransfer[] = [
          { inToken: DAI.address, amountIn: UNIT_DAI },
          { inToken: wBTC.address, amountIn: UNIT_WBTC },
          { inToken: wETH.address, amountIn: UNIT_ETH },
          { inToken: USDC.address, amountIn: BigNumber.from(0) },
          { inToken: agEUR.address, amountIn: BigNumber.from(0) },
          { inToken: sanTokenWBTC.address, amountIn: BigNumber.from(0) },
          { inToken: sanTokenDAI.address, amountIn: BigNumber.from(0) },
          { inToken: ANGLE.address, amountIn: BigNumber.from(0) },
          { inToken: gaugeEUR.address, amountIn: BigNumber.from(0) },
          { inToken: gaugeSanEURDAI.address, amountIn: BigNumber.from(0) },
          { inToken: gaugeSanEURWBTC.address, amountIn: BigNumber.from(0) },
        ];
        const swaps: TypeSwap[] = [];

        const actions: ActionType[] = [];
        const datas: string[] = [];

        await expect(angleRouter.connect(user).mixer(permits, transfers, [], actions, datas)).to.be.revertedWith(
          'panic code 0x32 (Array accessed at an out-of-bounds or negative index)',
        );
      });
      it('revert - balance', async () => {
        // permits done before
        const permits: TypePermit[] = [];

        const transfers: TypeTransfer[] = [{ inToken: DAI.address, amountIn: BALANCE_DAI.add(UNIT_DAI) }];
        const swaps: TypeSwap[] = [
          {
            inToken: wETH.address,
            collateral: DAI.address,
            amountIn: BALANCE_ETH.add(UNIT_ETH),
            minAmountOut: UNIT_DAI.mul(ETHORACLEUSD),
            args: '0x',
            swapType: SwapType.UniswapV3,
          },
        ];

        const actions = [ActionType.openPerpetual];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'uint256', 'uint256', 'bool', 'address', 'address'],
            [
              user.address,
              UNIT_DAI.mul(BigNumber.from(2)),
              UNIT_DAI,
              DAIORACLEUSD.mul(BASE_18),
              BigNumber.from(0),
              false,
              agEUR.address,
              DAI.address,
            ],
          ),
        ];

        await expect(angleRouter.connect(user).mixer(permits, transfers, [], actions, datas)).to.be.revertedWith(
          'ERC20: transfer amount exceeds balance',
        );
        await expect(angleRouter.connect(user).mixer(permits, [], swaps, actions, datas)).to.be.revertedWith(
          'ERC20: transfer amount exceeds balance',
        );
      });
    });
    describe('Deposit & Stake', () => {
      it('success - staking', async () => {
        const collateralParams = await stableMasterEUR.connect(user).collateralMap(managerWBTC.address);
        await (await wBTC.connect(governor).mint(cleanAddress.address, UNIT_WBTC)).wait();

        const transfers: TypeTransfer[] = [{ inToken: wBTC.address, amountIn: UNIT_WBTC }];
        const swaps: TypeSwap[] = [];
        const actions = [ActionType.deposit, ActionType.gaugeDeposit];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'bool', 'address', 'address', 'address', 'address'],
            [
              angleRouter.address,
              BASE_PARAMS,
              false,
              agEUR.address,
              wBTC.address,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
            ],
          ),
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'address', 'address', 'bool'],
            [user.address, BASE_PARAMS, sanTokenWBTC.address, gaugeSanEURWBTC.address, false],
          ),
        ];
        await angleRouter.connect(cleanAddress).mixer([], transfers, swaps, actions, datas);

        const expectSanTokenVal = UNIT_WBTC.mul(BASE_18).div(collateralParams.sanRate);
        expect(await wBTC.balanceOf(user.address)).to.be.equal(BALANCE_WBTC);
        expect(sanTokenWBTC.address).to.be.equal(collateralParams.sanToken);
        expect(await gaugeSanEURWBTC.balanceOf(user.address)).to.be.equal(expectSanTokenVal);
        expect(await sanTokenWBTC.balanceOf(user.address)).to.be.equal(ethers.constants.Zero);
        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
      });
      it('success - no staking', async () => {
        const userGaugebalancePre = await gaugeSanEURWBTC.balanceOf(user.address);
        const userSanbalancePre = await sanTokenWBTC.balanceOf(user.address);
        const collateralParams = await stableMasterEUR.connect(user).collateralMap(managerWBTC.address);
        await (await wBTC.connect(governor).mint(cleanAddress.address, UNIT_WBTC)).wait();

        const transfers: TypeTransfer[] = [{ inToken: wBTC.address, amountIn: UNIT_WBTC }];
        const swaps: TypeSwap[] = [];
        const actions = [ActionType.deposit];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'bool', 'address', 'address', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS,
              false,
              agEUR.address,
              wBTC.address,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
            ],
          ),
        ];

        await angleRouter.connect(cleanAddress).mixer([], transfers, swaps, actions, datas);

        const expectSanTokenVal = UNIT_WBTC.mul(BASE_18).div(collateralParams.sanRate);

        expect(await wBTC.balanceOf(user.address)).to.be.equal(BALANCE_WBTC);
        expect(await gaugeSanEURWBTC.balanceOf(user.address)).to.be.equal(userGaugebalancePre);
        expect(await sanTokenWBTC.balanceOf(user.address)).to.be.equal(userSanbalancePre.add(expectSanTokenVal));
        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
      });
    });
    describe('Mint', () => {
      it('revert - wrong collateral', async () => {
        const transfers: TypeTransfer[] = [{ inToken: wBTC.address, amountIn: UNIT_WBTC }];
        const swaps: TypeSwap[] = [];
        const actions = [ActionType.mint];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'bool', 'address', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS,
              ETHORACLEUSD.mul(UNIT_DAI),
              false,
              agEUR.address,
              DAI.address,
              ethers.constants.AddressZero,
            ],
          ),
        ];
        await expect(angleRouter.connect(user).mixer([], transfers, swaps, actions, datas)).to.be.revertedWith('33');
      });
      it('success - swap', async () => {
        const userAgEURbalancePre = await agEUR.balanceOf(user.address);

        const transfers: TypeTransfer[] = [];
        const swaps: TypeSwap[] = [
          {
            inToken: wETH.address,
            collateral: DAI.address,
            amountIn: UNIT_ETH,
            minAmountOut: UNIT_DAI.mul(ETHORACLEUSD),
            args: '0x',
            swapType: SwapType.UniswapV3,
          },
        ];
        const actions = [ActionType.mint];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'bool', 'address', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS,
              ETHORACLEUSD.mul(UNIT_DAI),
              false,
              agEUR.address,
              DAI.address,
              ethers.constants.AddressZero,
            ],
          ),
        ];
        await angleRouter.connect(user).mixer([], transfers, swaps, actions, datas);

        BALANCE_ETH = BALANCE_ETH.sub(UNIT_ETH);
        expect(await wETH.balanceOf(user.address)).to.be.equal(BALANCE_ETH);
        const expectedEURVal = ETHORACLEUSD.mul(UNIT_DAI);
        BALANCE_AGEUR = BALANCE_AGEUR.add(expectedEURVal);
        expect(await agEUR.balanceOf(user.address)).to.be.equal(userAgEURbalancePre.add(expectedEURVal));
        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
      });

      it('success - swap - external caller', async () => {
        const userAgEURbalancePre = await agEUR.balanceOf(user.address);
        await (await wETH.connect(governor).mint(cleanAddress.address, UNIT_ETH)).wait();

        const transfers: TypeTransfer[] = [];
        const swaps: TypeSwap[] = [
          {
            inToken: wETH.address,
            collateral: DAI.address,
            amountIn: UNIT_ETH,
            minAmountOut: UNIT_DAI.mul(ETHORACLEUSD),
            args: '0x',
            swapType: SwapType.UniswapV3,
          },
        ];
        const actions = [ActionType.mint];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'bool', 'address', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS,
              ETHORACLEUSD.mul(UNIT_DAI),
              false,
              agEUR.address,
              DAI.address,
              ethers.constants.AddressZero,
            ],
          ),
        ];
        await angleRouter.connect(cleanAddress).mixer([], transfers, swaps, actions, datas);

        expect(await wETH.balanceOf(user.address)).to.be.equal(BALANCE_ETH);
        const expectedEURVal = ETHORACLEUSD.mul(UNIT_DAI);
        BALANCE_AGEUR = BALANCE_AGEUR.add(expectedEURVal);
        expect(await agEUR.balanceOf(user.address)).to.be.equal(userAgEURbalancePre.add(expectedEURVal));
        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
      });
    });
    describe('Burn', () => {
      it('success - create stables', async () => {
        await DAI.connect(governor).mint(burner.address, UNIT_DAI);
        await DAI.connect(burner).approve(stableMasterEUR.address, UNIT_DAI);
        await stableMasterEUR.connect(burner).mint(UNIT_DAI, burner.address, managerDAI.address, parseAmount.ether(1));
        expect(await agEUR.balanceOf(burner.address)).to.be.equal(parseAmount.ether(1));
      });
      it('revert - wrong stablecoin', async () => {
        await expect(
          angleRouter.connect(burner).burn(burner.address, parseAmount.ether(1), UNIT_DAI, DAI.address, DAI.address),
        ).to.be.revertedWith('0');
      });
      it('revert - wrong collateral', async () => {
        await expect(
          angleRouter
            .connect(burner)
            .burn(burner.address, parseAmount.ether(1), UNIT_DAI, agEUR.address, agEUR.address),
        ).to.be.revertedWith('0');
      });
      it('revert - angleRouter not allowed to burn agTokens', async () => {
        await expect(
          angleRouter.connect(burner).burn(burner.address, parseAmount.ether(1), UNIT_DAI, agEUR.address, DAI.address),
        ).to.be.revertedWith('23');
      });
      it('revert - wrong amount', async () => {
        await agEUR.connect(burner).approve(angleRouter.address, parseAmount.ether(1.1));
        await expect(
          angleRouter
            .connect(burner)
            .burn(burner.address, parseAmount.ether(1.1), UNIT_DAI, agEUR.address, DAI.address),
        ).to.be.revertedWith('ERC20: burn amount exceeds balance');
      });
      it('success - for itself', async () => {
        await agEUR.connect(burner).approve(angleRouter.address, parseAmount.ether(1));
        await angleRouter
          .connect(burner)
          .burn(burner.address, parseAmount.ether(1), UNIT_DAI, agEUR.address, DAI.address);
        expect(await DAI.balanceOf(burner.address)).to.be.equal(UNIT_DAI);
        expect(await agEUR.balanceOf(burner.address)).to.be.equal(ethers.constants.Zero);
        await DAI.connect(burner).burn(managerDAI.address, UNIT_DAI);
      });
      it('success - for someone else', async () => {
        await agEUR.connect(burner).approve(angleRouter.address, parseAmount.ether(1));
        await DAI.connect(burner).approve(stableMasterEUR.address, UNIT_DAI);
        await stableMasterEUR.connect(burner).mint(UNIT_DAI, burner.address, managerDAI.address, parseAmount.ether(1));
        await angleRouter
          .connect(burner)
          .burn(user2.address, parseAmount.ether(1), UNIT_DAI, agEUR.address, DAI.address);
        expect(await agEUR.balanceOf(burner.address)).to.be.equal(ethers.constants.Zero);
        expect(await agEUR.balanceOf(user2.address)).to.be.equal(ethers.constants.Zero);
        expect(await DAI.balanceOf(burner.address)).to.be.equal(ethers.constants.Zero);
        expect(await DAI.balanceOf(user2.address)).to.be.equal(UNIT_DAI);
        await DAI.connect(user2).burn(managerDAI.address, UNIT_DAI);
      });
    });
    describe('openPerpetual', () => {
      it('success - open', async () => {
        const transfers: TypeTransfer[] = [];
        const swaps: TypeSwap[] = [
          {
            inToken: wETH.address,
            collateral: DAI.address,
            amountIn: UNIT_ETH.div(BigNumber.from(2)),
            minAmountOut: parseAmount.ether(ETHORACLEUSD).div(BigNumber.from(2)),
            args: '0x',
            swapType: SwapType.UniswapV3,
          },
        ];
        const actions = [ActionType.openPerpetual];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'uint256', 'uint256', 'bool', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS,
              parseAmount.ether(ETHORACLEUSD).div(BigNumber.from(2)),
              parseAmount.ether(DAIORACLEUSD),
              ethers.constants.Zero,
              false,
              agEUR.address,
              DAI.address,
            ],
          ),
        ];
        await angleRouter.connect(user).mixer([], transfers, swaps, actions, datas);

        BALANCE_ETH = BALANCE_ETH.sub(UNIT_ETH.div(BigNumber.from(2)));
        expect(await wETH.balanceOf(user.address)).to.be.equal(BALANCE_ETH);
        const perpData = await perpEURDAI.perpetualData(BigNumber.from(1));
        expect(await perpData.margin).to.be.equal(ETHORACLEUSD.mul(UNIT_DAI).div(BigNumber.from(2)));
        expect(await perpData.committedAmount).to.be.equal(ETHORACLEUSD.mul(UNIT_DAI).div(BigNumber.from(2)));
        expect(await perpData.entryRate).to.be.equal(parseAmount.ether(DAIORACLEUSD));
        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
      });
      it('success - open - external caller', async () => {
        await (await wETH.connect(governor).mint(cleanAddress.address, UNIT_ETH.div(BigNumber.from(2)))).wait();
        const transfers: TypeTransfer[] = [];
        const swaps: TypeSwap[] = [
          {
            inToken: wETH.address,
            collateral: DAI.address,
            amountIn: UNIT_ETH.div(BigNumber.from(2)),
            minAmountOut: parseAmount.ether(ETHORACLEUSD).div(BigNumber.from(2)),
            args: '0x',
            swapType: SwapType.UniswapV3,
          },
        ];
        const actions = [ActionType.openPerpetual];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'uint256', 'uint256', 'bool', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS,
              parseAmount.ether(ETHORACLEUSD).div(BigNumber.from(2)),
              parseAmount.ether(DAIORACLEUSD),
              ethers.constants.Zero,
              false,
              agEUR.address,
              DAI.address,
            ],
          ),
        ];
        await angleRouter.connect(cleanAddress).mixer([], transfers, swaps, actions, datas);

        const perpData = await perpEURDAI.perpetualData(BigNumber.from(2));
        expect(await perpData.margin).to.be.equal(ETHORACLEUSD.mul(UNIT_DAI).div(BigNumber.from(2)));
        expect(await perpData.committedAmount).to.be.equal(ETHORACLEUSD.mul(UNIT_DAI).div(BigNumber.from(2)));
        expect(await perpData.entryRate).to.be.equal(parseAmount.ether(DAIORACLEUSD));
        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
      });
    });
    describe('addToPerpetual', () => {
      it('success - swap', async () => {
        const transfers: TypeTransfer[] = [];
        const swaps: TypeSwap[] = [
          {
            inToken: wETH.address,
            collateral: DAI.address,
            amountIn: UNIT_ETH.div(BigNumber.from(2)),
            minAmountOut: parseAmount.ether(ETHORACLEUSD).div(BigNumber.from(2)),
            args: '0x',
            swapType: SwapType.UniswapV3,
          },
        ];
        const actions = [ActionType.addToPerpetual];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256', 'bool', 'address', 'address'],
            [BASE_PARAMS, BigNumber.from(1), false, agEUR.address, DAI.address],
          ),
        ];
        await angleRouter.connect(user).mixer([], transfers, swaps, actions, datas);

        BALANCE_ETH = BALANCE_ETH.sub(UNIT_ETH.div(BigNumber.from(2)));
        const perpData = await perpEURDAI.perpetualData(BigNumber.from(1));
        expect(await perpData.margin).to.be.equal(ETHORACLEUSD.mul(UNIT_DAI));
        expect(await perpData.committedAmount).to.be.equal(ETHORACLEUSD.mul(UNIT_DAI).div(BigNumber.from(2)));
        expect(await perpData.entryRate).to.be.equal(parseAmount.ether(DAIORACLEUSD));
        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
      });
    });
    describe('withdraw - and stake', () => {
      it('success - not processed', async () => {
        const prevSanBalance = await sanTokenWBTC.balanceOf(user.address);
        const prevSanStakedBalance = await gaugeSanEURWBTC.balanceOf(user.address);

        let transfers: TypeTransfer[] = [{ inToken: wBTC.address, amountIn: UNIT_WBTC }];
        let actions = [ActionType.deposit];
        let datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'bool', 'address', 'address', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS,
              false,
              agEUR.address,
              wBTC.address,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
            ],
          ),
        ];
        await angleRouter.connect(user).mixer([], transfers, [], actions, datas);

        const sanTokenToWithdraw = (await sanTokenWBTC.balanceOf(user.address)).sub(prevSanBalance);
        const permits: TypePermit[] = [
          await signPermit(
            user,
            0,
            sanTokenWBTC.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
            angleRouter.address,
            sanTokenToWithdraw,
            'san_wBTC',
          ),
        ];
        transfers = [
          {
            inToken: sanTokenWBTC.address,
            amountIn: sanTokenToWithdraw,
          },
        ];
        actions = [ActionType.withdraw, ActionType.deposit];
        datas = [
          ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'bool', 'address', 'address', 'address'],
            [BASE_PARAMS, false, agEUR.address, wBTC.address, sanTokenWBTC.address],
          ),
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'bool', 'address', 'address', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS,
              false,
              agEUR.address,
              wBTC.address,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
            ],
          ),
        ];
        await angleRouter.connect(user).mixer(permits, transfers, [], actions, datas);

        expect(await gaugeSanEURWBTC.balanceOf(user.address)).to.be.equal(prevSanStakedBalance);
        expect(await sanTokenWBTC.balanceOf(user.address)).to.be.equal(prevSanBalance.add(sanTokenToWithdraw));
        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
      });
      it('success - address processed', async () => {
        const prevSanBalance = await sanTokenWBTC.balanceOf(user.address);
        const prevSanStakedBalance = await gaugeSanEURWBTC.balanceOf(user.address);

        let transfers: TypeTransfer[] = [{ inToken: wBTC.address, amountIn: UNIT_WBTC }];
        let actions = [ActionType.deposit];
        let datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'bool', 'address', 'address', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS,
              true,
              stableMasterEUR.address,
              wBTC.address,
              managerWBTC.address,
              sanTokenWBTC.address,
            ],
          ),
        ];
        await angleRouter.connect(user).mixer([], transfers, [], actions, datas);

        const sanTokenToWithdraw = (await sanTokenWBTC.balanceOf(user.address)).sub(prevSanBalance);
        const permits: TypePermit[] = [
          await signPermit(
            user,
            1,
            sanTokenWBTC.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
            angleRouter.address,
            sanTokenToWithdraw,
            'san_wBTC',
          ),
        ];
        transfers = [
          {
            inToken: sanTokenWBTC.address,
            amountIn: sanTokenToWithdraw,
          },
        ];
        actions = [ActionType.withdraw, ActionType.deposit];
        datas = [
          ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'bool', 'address', 'address', 'address'],
            [BASE_PARAMS, true, stableMasterEUR.address, managerWBTC.address, sanTokenWBTC.address],
          ),
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'bool', 'address', 'address', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS,
              true,
              stableMasterEUR.address,
              wBTC.address,
              managerWBTC.address,
              sanTokenWBTC.address,
            ],
          ),
        ];
        await angleRouter.connect(user).mixer(permits, transfers, [], actions, datas);

        expect(await gaugeSanEURWBTC.balanceOf(user.address)).to.be.equal(prevSanStakedBalance);
        expect(await sanTokenWBTC.balanceOf(user.address)).to.be.equal(prevSanBalance.add(sanTokenToWithdraw));
        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
      });
    });
    describe('claimRewards', () => {
      it('success - stake in gauges', async () => {
        const transfers: TypeTransfer[] = [{ inToken: wBTC.address, amountIn: UNIT_WBTC }];
        const swaps: TypeSwap[] = [];
        const actions = [ActionType.deposit, ActionType.gaugeDeposit];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'bool', 'address', 'address', 'address', 'address'],
            [
              angleRouter.address,
              BASE_PARAMS,
              false,
              agEUR.address,
              wBTC.address,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
            ],
          ),
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'address', 'address', 'bool'],
            [user.address, BASE_PARAMS, sanTokenWBTC.address, gaugeSanEURWBTC.address, false],
          ),
        ];
        await angleRouter.connect(user).mixer([], transfers, swaps, actions, datas);

        const agEURBalance = await agEUR.balanceOf(user.address);
        await agEUR.connect(user).approve(gaugeEUR.address, ethers.constants.MaxUint256);
        await gaugeEUR.connect(user)['deposit(uint256)'](agEURBalance);
        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
      });
      it('revert - null gauge address', async () => {
        const actions = [ActionType.claimRewards];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'address[]', 'uint256[]', 'bool', 'address[]', 'address[]'],
            [
              user.address,
              ethers.constants.Zero,
              [gaugeEUR.address, ethers.constants.AddressZero, gaugeSanEURDAI.address],
              [],
              false,
              [],
              [],
            ],
          ),
        ];
        await expect(angleRouter.connect(user2).mixer([], [], [], actions, datas)).to.be.reverted;
      });
      it('revert - wrong gauge address', async () => {
        const actions = [ActionType.claimRewards];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'address[]', 'uint256[]', 'bool', 'address[]', 'address[]'],
            [
              user.address,
              ethers.constants.Zero,
              [gaugeEUR.address, agEUR.address, gaugeSanEURDAI.address],
              [],
              false,
              [],
              [],
            ],
          ),
        ];
        await expect(angleRouter.connect(user2).mixer([], [], [], actions, datas)).to.be.reverted;
      });
      it('success - only gauges', async () => {
        // letting some time goes by to have significant ANGLE amount
        await network.provider.send('evm_increaseTime', [DAY]);
        await network.provider.send('evm_mine');
        const balanceAnglePre = await ANGLE.balanceOf(user.address);
        const claimableOnEUR = await gaugeEUR.connect(user).claimable_reward(user.address, ANGLE.address);
        const claimableOnSanDAI = await gaugeSanEURDAI.connect(user).claimable_reward(user.address, ANGLE.address);
        const claimableOnSANWBTC = await gaugeSanEURWBTC.connect(user).claimable_reward(user.address, ANGLE.address);
        const sumRewards = claimableOnEUR.add(claimableOnSanDAI).add(claimableOnSANWBTC);
        const actions = [ActionType.claimRewards];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'address[]', 'uint256[]', 'bool', 'address[]', 'address[]'],
            [
              user.address,
              ethers.constants.Zero,
              [gaugeEUR.address, gaugeSanEURWBTC.address, gaugeSanEURDAI.address],
              [],
              false,
              [],
              [],
            ],
          ),
        ];
        await angleRouter.connect(user2).mixer([], [], [], actions, datas);
        // need approximation as when calling the claimable - blocks are still being mined
        expectApproxDelta(
          await ANGLE.balanceOf(user.address),
          balanceAnglePre.add(sumRewards),
          BigNumber.from(10 ** 4),
        );
        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
      });
      it('success - open perp', async () => {
        const transfers: TypeTransfer[] = [
          { inToken: wBTC.address, amountIn: UNIT_WBTC.mul(BigNumber.from(5)).div(BigNumber.from(4)) },
        ];
        const swaps: TypeSwap[] = [];
        const actions = [ActionType.mint, ActionType.openPerpetual];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'bool', 'address', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS.mul(BigNumber.from(4)).div(BigNumber.from(5)),
              parseAmount.ether(wBTCORACLEUSD),
              false,
              agEUR.address,
              wBTC.address,
              ethers.constants.AddressZero,
            ],
          ),
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'uint256', 'uint256', 'bool', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS,
              UNIT_WBTC.div(BigNumber.from(4)),
              parseAmount.ether(wBTCORACLEUSD),
              BigNumber.from(0),
              false,
              agEUR.address,
              wBTC.address,
            ],
          ),
        ];
        await angleRouter.connect(user).mixer([], transfers, swaps, actions, datas);

        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
      });
      it('revert - wrong array size', async () => {
        const actions = [ActionType.claimRewards];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'address[]', 'uint256[]', 'bool', 'address[]', 'address[]'],
            [
              user.address,
              ethers.constants.Zero,
              [],
              [BigNumber.from(1)],
              false,
              [agEUR.address, agEUR.address],
              [wBTC.address, DAI.address],
            ],
          ),
        ];
        await expect(angleRouter.connect(user2).mixer([], [], [], actions, datas)).to.be.revertedWith('104');
      });
      it('revert - wrong array size', async () => {
        const actions = [ActionType.claimRewards];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'address[]', 'uint256[]', 'bool', 'address[]', 'address[]'],
            [
              user.address,
              ethers.constants.Zero,
              [],
              [BigNumber.from(1)],
              false,
              [agEUR.address],
              [wBTC.address, DAI.address],
            ],
          ),
        ];
        await expect(angleRouter.connect(user2).mixer([], [], [], actions, datas)).to.be.revertedWith('104');
      });
      it('revert - wrong array size', async () => {
        const actions = [ActionType.claimRewards];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'address[]', 'uint256[]', 'bool', 'address[]', 'address[]'],
            [
              user.address,
              ethers.constants.Zero,
              [],
              [BigNumber.from(1)],
              false,
              [agEUR.address, agEUR.address, agEUR.address],
              [wBTC.address, DAI.address],
            ],
          ),
        ];
        await expect(angleRouter.connect(user2).mixer([], [], [], actions, datas)).to.be.revertedWith('104');
      });
      it('success - only perp (no need for approval)', async () => {
        // letting some time goes by to have significant ANGLE amount
        await network.provider.send('evm_increaseTime', [DAY]);
        await network.provider.send('evm_mine');
        const balanceAnglePre = await ANGLE.balanceOf(user.address);
        const claimableOnWBTC = await perpEURWBTC.connect(user).earned(BigNumber.from(1));
        const claimableOnDAI = await perpEURDAI.connect(user).earned(BigNumber.from(1));
        const sumRewards = claimableOnDAI.add(claimableOnWBTC);
        const actions = [ActionType.claimRewards];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'address[]', 'uint256[]', 'bool', 'address[]', 'address[]'],
            [
              user.address,
              ethers.constants.Zero,
              [],
              [BigNumber.from(1), BigNumber.from(1)],
              true,
              [ethers.constants.AddressZero, ethers.constants.AddressZero],
              [perpEURWBTC.address, perpEURDAI.address],
            ],
          ),
        ];
        await (await angleRouter.connect(user2).mixer([], [], [], actions, datas)).wait();

        // need approximation as when calling the claimable - blocks are still being mined
        expectApproxDelta(
          await ANGLE.balanceOf(user.address),
          balanceAnglePre.add(sumRewards),
          BigNumber.from(10 ** 4),
        );

        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
      });
      // it('locking ANGLE - user', async () => {
      //   const startTs = await (await web3.eth.getBlock('latest')).timestamp;
      //   await (await ANGLE.connect(user).approve(veANGLE.address, ethers.constants.MaxUint256)).wait();
      //   await veANGLE
      //     .connect(user)
      //     .create_lock(BALANCE_ANGLE, BigNumber.from(startTs).add(BigNumber.from(WEEK * 53 * 3)));
      // });
      it('success - all', async () => {
        // letting some time goes by to have significant ANGLE amount
        await network.provider.send('evm_increaseTime', [DAY]);
        await network.provider.send('evm_mine');
        const balanceAnglePre = await ANGLE.balanceOf(user.address);
        const claimableOnEUR = await gaugeEUR.connect(user).claimable_reward(user.address, ANGLE.address);
        const claimableOnSanDAI = await gaugeSanEURDAI.connect(user).claimable_reward(user.address, ANGLE.address);
        const claimableOnSANWBTC = await gaugeSanEURWBTC.connect(user).claimable_reward(user.address, ANGLE.address);
        const claimableOnWBTC = await perpEURWBTC.connect(user).earned(BigNumber.from(1));
        const claimableOnDAI = await perpEURDAI.connect(user).earned(BigNumber.from(1));
        const sumRewards = claimableOnDAI
          .add(claimableOnWBTC)
          .add(claimableOnSanDAI)
          .add(claimableOnEUR)
          .add(claimableOnSANWBTC);

        const actions = [ActionType.claimRewards];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'address[]', 'uint256[]', 'bool', 'address[]', 'address[]'],
            [
              user.address,
              BASE_PARAMS,
              [gaugeEUR.address, gaugeSanEURWBTC.address, gaugeSanEURDAI.address],
              [BigNumber.from(1), BigNumber.from(1)],
              false,
              [agEUR.address, agEUR.address],
              [wBTC.address, DAI.address],
            ],
          ),
        ];
        await (await angleRouter.connect(user).mixer([], [], [], actions, datas)).wait();

        // check new locked ANGLE
        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
        // need approximation as when calling the claimable - blocks are still being mined
        expectApproxDelta(
          await ANGLE.balanceOf(user.address),
          balanceAnglePre.add(sumRewards),
          BigNumber.from(10 ** 4),
        );
      });
    });
    describe('claimWeeklyInterest & Stake(?)', () => {
      it('locking ANGLE', async () => {
        const startTs = await (await web3.eth.getBlock('latest')).timestamp;
        await (await ANGLE.connect(user2).approve(veANGLE.address, ethers.constants.MaxUint256)).wait();
        await veANGLE
          .connect(user2)
          .create_lock(BALANCE2_ANGLE, BigNumber.from(startTs).add(BigNumber.from(WEEK * 53 * 3)));
        // letting time goes to have positive veANGLE balance at the beginning of the week
        await network.provider.send('evm_increaseTime', [WEEK]);
        await network.provider.send('evm_mine');
      });
      it('governor distribute - 1', async () => {
        // to set the last token time to the current week --> all will be distributed for the current week
        await interestDistributorAgEUR.connect(governor).checkpoint_token();
        await interestDistributorSanwBTCEUR.connect(governor).checkpoint_token();

        // approve the necessary contracts
        await wBTC.connect(governor).approve(angleRouter.address, ethers.constants.MaxUint256);
        await wBTC.connect(governor).approve(stableMasterEUR.address, ethers.constants.MaxUint256);

        // create and distribute rewards
        const transfers: TypeTransfer[] = [{ inToken: wBTC.address, amountIn: UNIT_WBTC }];
        const swaps: TypeSwap[] = [];
        const actions = [ActionType.mint];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'bool', 'address', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS,
              parseAmount.ether(wBTCORACLEUSD),
              false,
              agEUR.address,
              wBTC.address,
              ethers.constants.AddressZero,
            ],
          ),
        ];
        await angleRouter.connect(user).mixer([], transfers, swaps, actions, datas);

        REWARD_AGEUR = await agEUR.balanceOf(governor.address);
        await agEUR.connect(governor).transfer(interestDistributorAgEUR.address, REWARD_AGEUR);

        await stableMasterEUR.connect(governor).deposit(UNIT_WBTC, governor.address, managerWBTC.address);
        REWARD_SANWBTC = await sanTokenWBTC.balanceOf(governor.address);
        await sanTokenWBTC.connect(governor).transfer(interestDistributorSanwBTCEUR.address, REWARD_SANWBTC);

        await interestDistributorAgEUR.connect(governor).checkpoint_token();
        await interestDistributorSanwBTCEUR.connect(governor).checkpoint_token();
        // letting time goes to be on next week --> possibility to claim reward for the past week
        await network.provider.send('evm_increaseTime', [WEEK]);
        await network.provider.send('evm_mine');
        await interestDistributorAgEUR.connect(governor).checkpoint_token();
        await interestDistributorSanwBTCEUR.connect(governor).checkpoint_token();
      });
      it('success - claim & no staking', async () => {
        const balanceEURPre = await agEUR.balanceOf(user2.address);

        const transfers: TypeTransfer[] = [];
        const swaps: TypeSwap[] = [];
        const actions = [ActionType.claimWeeklyInterest];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'address', 'bool'],
            [user2.address, interestDistributorAgEUR.address, false],
          ),
        ];
        await (await angleRouter.connect(user2).mixer([], transfers, swaps, actions, datas)).wait();

        // need approximation as when calling the claimable - blocks are still being mined
        expectApproxDelta(
          await agEUR.balanceOf(user2.address),
          balanceEURPre.add(REWARD_AGEUR),
          BigNumber.from(10 ** 6),
        );

        expect(await gaugeEUR.balanceOf(user2.address)).to.be.equal(ethers.constants.Zero);
        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
      });
      // it would just make a transfer at the end with the new architecture
      // it('success - claim & stake - forgot action to stake', async () => {
      //   await (await sanTokenWBTC.connect(user2).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();

      //   let actions = [ActionType.claimWeeklyInterest];
      //   let datas: string[] = [
      //     ethers.utils.defaultAbiCoder.encode(
      //       ['address', 'address', 'bool'],
      //       [user2.address, interestDistributorSanwBTCEUR.address, true],
      //     ),
      //   ];
      //   await angleRouter.connect(user2).mixer([], [], [], actions, datas);
      // });
      it('success - claim & stake', async () => {
        await (await sanTokenWBTC.connect(user2).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();

        const balanceSanPre = await sanTokenWBTC.balanceOf(user2.address);
        const balanceGaugeSanPre = await gaugeSanEURWBTC.balanceOf(user2.address);

        const transfers: TypeTransfer[] = [];
        const swaps: TypeSwap[] = [];
        const actions = [ActionType.claimWeeklyInterest, ActionType.gaugeDeposit];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'address', 'bool'],
            [user2.address, interestDistributorSanwBTCEUR.address, true],
          ),
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'address', 'address', 'bool'],
            [user2.address, BASE_PARAMS, sanTokenWBTC.address, gaugeSanEURWBTC.address, false],
          ),
        ];
        await (await angleRouter.connect(user2).mixer([], transfers, swaps, actions, datas)).wait();

        // need approximation as when calling the claimable - blocks are still being mined
        expect(await sanTokenWBTC.balanceOf(user2.address)).to.be.equal(balanceSanPre);
        expect(await gaugeSanEURWBTC.balanceOf(user2.address)).to.be.equal(REWARD_SANWBTC.add(balanceGaugeSanPre));
        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
      });
      it('governor distribute - 2', async () => {
        // letting time goes to have a fresh start
        const freshStartTS = BigNumber.from(await (await web3.eth.getBlock('latest')).timestamp)
          .div(BigNumber.from(WEEK))
          .mul(BigNumber.from(WEEK))
          .add(BigNumber.from(WEEK));
        await network.provider.send('evm_setNextBlockTimestamp', [freshStartTS.toNumber()]);
        await network.provider.send('evm_mine');
        // to set the last token time to the current week --> all will be distributed for the current week
        await (await interestDistributorSanwBTCEUR.connect(governor).checkpoint_token()).wait();
        await (await interestDistributorAgEUR.connect(governor).checkpoint_token()).wait();
        await (await interestDistributorSanwBTCEUR.connect(user2)['claim()']()).wait();
        await (await interestDistributorAgEUR.connect(user2)['claim()']()).wait();

        // create and distribute rewards

        const transfers: TypeTransfer[] = [{ inToken: wBTC.address, amountIn: UNIT_WBTC }];
        const swaps: TypeSwap[] = [];
        const actions = [ActionType.mint];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'bool', 'address', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS,
              parseAmount.ether(wBTCORACLEUSD),
              false,
              agEUR.address,
              wBTC.address,
              ethers.constants.AddressZero,
            ],
          ),
        ];
        await angleRouter.connect(user).mixer([], transfers, swaps, actions, datas);

        REWARD_AGEUR = await agEUR.balanceOf(governor.address);
        await agEUR.connect(governor).transfer(interestDistributorAgEUR.address, REWARD_AGEUR);

        await stableMasterEUR.connect(governor).deposit(UNIT_WBTC, governor.address, managerWBTC.address);
        REWARD_SANWBTC = await sanTokenWBTC.balanceOf(governor.address);
        await sanTokenWBTC.connect(governor).transfer(interestDistributorSanwBTCEUR.address, REWARD_SANWBTC);

        // letting time goes to be on next week --> possibility to claim reward for the past week
        await network.provider.send('evm_setNextBlockTimestamp', [freshStartTS.add(BigNumber.from(WEEK)).toNumber()]);
        await network.provider.send('evm_mine');
        await interestDistributorSanwBTCEUR.connect(governor).checkpoint_token();
        await interestDistributorAgEUR.connect(governor).checkpoint_token();
      });
      it('success - claim & no staking - external caller', async () => {
        const balanceEURPre = await agEUR.balanceOf(user2.address);

        // await (await agEUR.connect(user2).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
        const transfers: TypeTransfer[] = [];
        const swaps: TypeSwap[] = [];
        const actions = [ActionType.claimWeeklyInterest];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'address', 'bool'],
            [user2.address, interestDistributorAgEUR.address, false],
          ),
        ];
        await (await angleRouter.connect(cleanAddress).mixer([], transfers, swaps, actions, datas)).wait();

        // need approximation as when calling the claimable - blocks are still being mined
        expectApproxDelta(
          await agEUR.balanceOf(user2.address),
          balanceEURPre.add(REWARD_AGEUR),
          BigNumber.from(10 ** 4),
        );

        expect(await gaugeEUR.balanceOf(user2.address)).to.be.equal(ethers.constants.Zero);
        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
      });
    });
    describe('claimWeeklyInterest & Mint', () => {
      it('governor distribute', async () => {
        // letting time goes to have a fresh start
        const freshStartTS = BigNumber.from(await (await web3.eth.getBlock('latest')).timestamp)
          .div(BigNumber.from(WEEK))
          .mul(BigNumber.from(WEEK))
          .add(BigNumber.from(WEEK));
        await network.provider.send('evm_setNextBlockTimestamp', [freshStartTS.toNumber()]);
        await network.provider.send('evm_mine');
        // to set the last token time to the current week --> all will be distributed for the current week
        await (await interestDistributorSanwBTCEUR.connect(governor).checkpoint_token()).wait();
        await (await interestDistributorSanwBTCEUR.connect(user2)['claim()']()).wait();

        // create and distribute rewards
        await stableMasterEUR.connect(governor).deposit(UNIT_WBTC, governor.address, managerWBTC.address);
        REWARD_SANWBTC = await sanTokenWBTC.balanceOf(governor.address);
        await sanTokenWBTC.connect(governor).transfer(interestDistributorSanwBTCEUR.address, REWARD_SANWBTC);

        // letting time goes to be on next week --> possibility to claim reward for the past week
        await network.provider.send('evm_setNextBlockTimestamp', [freshStartTS.add(BigNumber.from(WEEK)).toNumber()]);
        await network.provider.send('evm_mine');
        await interestDistributorSanwBTCEUR.connect(governor).checkpoint_token();
      });
      it('success', async () => {
        const balanceSanPre = await sanTokenWBTC.balanceOf(user2.address);
        const balanceEURPre = await agEUR.balanceOf(user2.address);
        const collateralParams = await stableMasterEUR.connect(user).collateralMap(managerWBTC.address);

        const expectEURVal = REWARD_SANWBTC.mul(wBTCORACLEUSD).mul(collateralParams.sanRate).div(UNIT_WBTC);

        await (await sanTokenWBTC.connect(user2).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
        await (await wBTC.connect(user2).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();

        const transfers: TypeTransfer[] = [];
        const swaps: TypeSwap[] = [];
        const actions = [ActionType.claimWeeklyInterest, ActionType.withdraw, ActionType.mint];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'address', 'bool'],
            [user2.address, interestDistributorSanwBTCEUR.address, true],
          ),
          ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'bool', 'address', 'address', 'address'],
            [BASE_PARAMS, false, agEUR.address, wBTC.address, sanTokenWBTC.address],
          ),
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'bool', 'address', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS,
              ethers.constants.Zero,
              false,
              agEUR.address,
              wBTC.address,
              ethers.constants.AddressZero,
            ],
          ),
        ];
        await (await angleRouter.connect(user2).mixer([], transfers, swaps, actions, datas)).wait();

        // need approximation as when calling claim - blocks are still being mined
        expect(await sanTokenWBTC.balanceOf(user2.address)).to.be.equal(balanceSanPre);
        expectApproxDelta(
          await agEUR.balanceOf(user2.address),
          expectEURVal.add(balanceEURPre),
          BigNumber.from(10 ** 4),
        );
        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
      });
    });
    describe('Processed address', () => {
      it('success - processed address', async () => {
        await (await DAI.connect(governor).mint(user.address, UNIT_DAI.mul(BigNumber.from(3)))).wait();
        BALANCE_DAI = BALANCE_DAI.add(UNIT_DAI.mul(BigNumber.from(3)));

        const transfers: TypeTransfer[] = [{ inToken: DAI.address, amountIn: UNIT_DAI.mul(BigNumber.from(3)) }];
        const swaps: TypeSwap[] = [];
        const actions = [ActionType.mint, ActionType.openPerpetual, ActionType.addToPerpetual];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'bool', 'address', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS.div(BigNumber.from(2)),
              ethers.constants.Zero,
              true,
              stableMasterEUR.address,
              DAI.address,
              managerDAI.address,
            ],
          ),
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'uint256', 'uint256', 'bool', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS.div(BigNumber.from(2)),
              UNIT_DAI.mul(BigNumber.from(2)),
              parseAmount.ether(DAIORACLEUSD),
              ethers.constants.Zero,
              true,
              perpEURDAI.address,
              DAI.address,
            ],
          ),

          ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256', 'bool', 'address', 'address'],
            [BASE_PARAMS, BigNumber.from(3), true, perpEURDAI.address, DAI.address],
          ),
        ];
        await angleRouter.connect(user).mixer([], transfers, swaps, actions, datas);

        const perpData = await perpEURDAI.perpetualData(BigNumber.from(3));
        expect(await perpData.committedAmount).to.be.equal(UNIT_DAI.mul(BigNumber.from(2)));
        expect(await perpData.entryRate).to.be.equal(parseAmount.ether(DAIORACLEUSD));
        expect(await perpData.margin).to.be.equal(UNIT_DAI.mul(BigNumber.from(3)).div(BigNumber.from(2)));

        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
      });
    });
  });
});
