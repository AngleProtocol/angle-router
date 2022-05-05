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

import { AngleRouter, MockANGLE, MockTokenPermit, Mock1Inch, MockAgToken } from '../../typechain';

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

import { signPermit } from '../../utils/sign';

let ANGLE: MockANGLE;
let veANGLE: VeANGLE;
let veBoostProxy: VeBoostProxy;
let angleDistributor: AngleDistributor;
let stableMasterEUR: StableMasterFront;
let agEUR: MockAgToken;

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
describe('AngleRouter - e2e', () => {
  before(async () => {
    [deployer, guardian, user, governor, cleanAddress] = await ethers.getSigners();

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
    ({ token: DAI, manager: managerDAI, sanToken: sanTokenDAI, perpetualManager: perpEURDAI } = await initCollateral(
      'DAI',
      stableMasterEUR,
      ANGLE,
      deployer,
      DAIdecimal,
      DAIORACLEUSD,
      0,
    ));
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

  describe('End2End Router', () => {
    describe('Swapping test', () => {
      it('1inch - revert - function with flaws', async () => {
        await (await USDC.connect(governor).mint(cleanAddress.address, UNIT_USDC)).wait();
        const payload1inch = web3.eth.abi.encodeFunctionCall(
          {
            name: 'unsupportedSwap',
            type: 'function',
            inputs: [],
          },
          [],
        );

        const swaps: TypeSwap[] = [
          {
            inToken: USDC.address,
            collateral: DAI.address,
            amountIn: UNIT_USDC,
            minAmountOut: parseAmount.ether(USDCORACLEUSD),
            args: payload1inch,
            swapType: SwapType.oneINCH,
          },
        ];

        await expect(angleRouter.connect(cleanAddress).mixer([], [], swaps, [], [])).to.be.revertedWith(
          'ERC20: transfer amount exceeds balance',
        );
      });
      it('1inch - revert - reverting function', async () => {
        const payload1inch = web3.eth.abi.encodeFunctionCall(
          {
            name: 'revertingSwap',
            type: 'function',
            inputs: [],
          },
          [],
        );

        const swaps: TypeSwap[] = [
          {
            inToken: USDC.address,
            collateral: DAI.address,
            amountIn: UNIT_USDC,
            minAmountOut: parseAmount.ether(USDCORACLEUSD),
            args: payload1inch,
            swapType: SwapType.oneINCH,
          },
        ];

        await expect(angleRouter.connect(cleanAddress).mixer([], [], swaps, [], [])).to.be.revertedWith('wrong swap');
      });
      it('1inch - revert - invalid function', async () => {
        const payload1inch = web3.eth.abi.encodeFunctionCall(
          {
            name: 'nonexistentFct',
            type: 'function',
            inputs: [],
          },
          [],
        );

        const swaps: TypeSwap[] = [
          {
            inToken: USDC.address,
            collateral: DAI.address,
            amountIn: UNIT_USDC,
            minAmountOut: parseAmount.ether(USDCORACLEUSD),
            args: payload1inch,
            swapType: SwapType.oneINCH,
          },
        ];

        await expect(angleRouter.connect(cleanAddress).mixer([], [], swaps, [], [])).to.be.revertedWith('117');
      });
      it('1inch - revert - slippage', async () => {
        const payload1inch = oneInchRouter.interface.encodeFunctionData('swap', [
          ethers.constants.AddressZero,
          {
            srcToken: USDC.address,
            dstToken: DAI.address,
            srcReceiver: oneInchRouter.address,
            dstReceiver: angleRouter.address,
            amount: UNIT_USDC,
            minReturnAmount: BigNumber.from(0),
            flags: BigNumber.from(0),
            permit: '0x',
          },
          '0x',
        ]);

        const swaps: TypeSwap[] = [
          {
            inToken: USDC.address,
            collateral: DAI.address,
            amountIn: UNIT_USDC,
            minAmountOut: UNIT_DAI.add(BigNumber.from(1)),
            args: payload1inch,
            swapType: SwapType.oneINCH,
          },
        ];

        await expect(angleRouter.connect(cleanAddress).mixer([], [], swaps, [], [])).to.be.revertedWith('15');
      });
      it('1inch - revert - swap target doesn t match collateral', async () => {
        const payload1inch = oneInchRouter.interface.encodeFunctionData('swap', [
          ethers.constants.AddressZero,
          {
            srcToken: USDC.address,
            dstToken: DAI.address,
            srcReceiver: oneInchRouter.address,
            dstReceiver: angleRouter.address,
            amount: UNIT_USDC,
            minReturnAmount: BigNumber.from(0),
            flags: BigNumber.from(0),
            permit: '0x',
          },
          '0x',
        ]);

        const swaps: TypeSwap[] = [
          {
            inToken: USDC.address,
            /* error: swap target was DAI but router will store it as a wBTC balance in `listTokens` and `balanceTokens`
            swap will be executed but mixer should revert when returning remaining funds at the end
            */
            collateral: wBTC.address,
            amountIn: UNIT_USDC,
            minAmountOut: parseAmount.ether(USDCORACLEUSD),
            args: payload1inch,
            swapType: SwapType.oneINCH,
          },
        ];

        await expect(angleRouter.connect(cleanAddress).mixer([], [], swaps, [], [])).to.be.revertedWith(
          'ERC20: transfer amount exceeds balance',
        );
      });
      it('1inch - revert - swap target doesn t match collateral and subsequent mint fails', async () => {
        const payload1inch = oneInchRouter.interface.encodeFunctionData('swap', [
          ethers.constants.AddressZero,
          {
            srcToken: USDC.address,
            dstToken: DAI.address,
            srcReceiver: oneInchRouter.address,
            dstReceiver: angleRouter.address,
            amount: UNIT_USDC,
            minReturnAmount: BigNumber.from(0),
            flags: BigNumber.from(0),
            permit: '0x',
          },
          '0x',
        ]);

        const swaps: TypeSwap[] = [
          {
            inToken: USDC.address,
            /* error: swap target was DAI but router will store it as a wBTC balance in `listTokens` and `balanceTokens`
            swap will be executed but mixer should revert when trying to mint with wBTC afterward
            */
            collateral: wBTC.address,
            amountIn: UNIT_USDC,
            minAmountOut: parseAmount.ether(USDCORACLEUSD),
            args: payload1inch,
            swapType: SwapType.oneINCH,
          },
        ];

        const actions = [ActionType.mint];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'bool', 'address', 'address', 'address'],
            [
              governor.address,
              BASE_PARAMS,
              parseAmount.ether(USDCORACLEUSD),
              false,
              agEUR.address,
              wBTC.address,
              ethers.constants.AddressZero,
            ],
          ),
        ];

        await expect(angleRouter.connect(cleanAddress).mixer([], [], swaps, actions, datas)).to.be.revertedWith(
          'ERC20: transfer amount exceeds balance',
        );
      });
      it('1inch - success', async () => {
        const payload1inch = oneInchRouter.interface.encodeFunctionData('swap', [
          ethers.constants.AddressZero,
          {
            srcToken: USDC.address,
            dstToken: DAI.address,
            srcReceiver: oneInchRouter.address,
            dstReceiver: angleRouter.address,
            amount: UNIT_USDC,
            minReturnAmount: BigNumber.from(0),
            flags: BigNumber.from(0),
            permit: '0x',
          },
          '0x',
        ]);

        const swaps: TypeSwap[] = [
          {
            inToken: USDC.address,
            collateral: DAI.address,
            amountIn: UNIT_USDC,
            minAmountOut: parseAmount.ether(USDCORACLEUSD),
            args: payload1inch,
            swapType: SwapType.oneINCH,
          },
        ];

        await angleRouter.connect(cleanAddress).mixer([], [], swaps, [], []);

        expect(await USDC.balanceOf(cleanAddress.address)).to.be.equal(ethers.constants.Zero);
        expect(await DAI.balanceOf(cleanAddress.address)).to.be.equal(parseAmount.ether(USDCORACLEUSD));
        // reset balance cleanAddress
        await await DAI.connect(cleanAddress).transfer(governor.address, parseAmount.ether(USDCORACLEUSD));

        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
      });
    });
    describe('Prepare environement', () => {
      it('Mint - for future perp', async () => {
        await (await wBTC.connect(governor).mint(governor.address, UNIT_WBTC.mul(BigNumber.from('100')))).wait();
        await (await DAI.connect(governor).mint(governor.address, UNIT_DAI.mul(BigNumber.from('100')))).wait();

        await (await DAI.connect(governor).approve(angleRouter.address, UNIT_DAI.mul(BigNumber.from('100')))).wait();
        await (await wBTC.connect(governor).approve(angleRouter.address, UNIT_WBTC.mul(BigNumber.from('100')))).wait();

        const transfers: TypeTransfer[] = [
          { inToken: wBTC.address, amountIn: UNIT_WBTC.mul(BigNumber.from('100')) },
          { inToken: DAI.address, amountIn: UNIT_DAI.mul(BigNumber.from('100')) },
        ];

        const actions = [ActionType.mint, ActionType.mint];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'bool', 'address', 'address', 'address'],
            [
              governor.address,
              BASE_PARAMS,
              UNIT_DAI.mul(BigNumber.from('100')),
              false,
              agEUR.address,
              DAI.address,
              ethers.constants.AddressZero,
            ],
          ),
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'bool', 'address', 'address', 'address'],
            [
              governor.address,
              BASE_PARAMS,
              parseAmount.ether(wBTCORACLEUSD).mul(BigNumber.from('100')),
              false,
              agEUR.address,
              wBTC.address,
              ethers.constants.AddressZero,
            ],
          ),
        ];
        await angleRouter.connect(governor).mixer([], transfers, [], actions, datas);

        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
      });
      it('locking ANGLE', async () => {
        const startTs = await (await web3.eth.getBlock('latest')).timestamp;
        await (await ANGLE.connect(user).approve(veANGLE.address, ethers.constants.MaxUint256)).wait();
        await veANGLE
          .connect(user)
          .create_lock(BALANCE_ANGLE, BigNumber.from(startTs).add(BigNumber.from(WEEK * 53 * 3)));
        BALANCE_ANGLE = BigNumber.from(0);
        // letting time goes to have positive veANGLE balance at the beginning of the week
        await network.provider.send('evm_increaseTime', [WEEK]);
        await network.provider.send('evm_mine');

        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
        await invariantFundsUser();
      });
      it('governor distribute - 1', async () => {
        // to set the last token time to the current week --> all will be distributed for the current week
        await interestDistributorAgEUR.connect(governor).checkpoint_token();
        await interestDistributorSanwBTCEUR.connect(governor).checkpoint_token();

        // approve the necessary contracts
        await wBTC.connect(governor).approve(angleRouter.address, ethers.constants.MaxUint256);
        await wBTC.connect(governor).approve(stableMasterEUR.address, ethers.constants.MaxUint256);

        // create and distribute rewards
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
    });
    describe('Mixer', () => {
      it('success - 2 collaterals after swaps', async () => {
        const permits: TypePermit[] = [
          await signPermit(
            user,
            0,
            DAI.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
            angleRouter.address,
            UNIT_DAI,
            'DAI',
          ),
          await signPermit(
            user,
            0,
            wETH.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
            angleRouter.address,
            UNIT_ETH,
            'wETH',
          ),
          await signPermit(
            user,
            0,
            wBTC.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
            angleRouter.address,
            UNIT_WBTC,
            'wBTC',
          ),
          await signPermit(
            user,
            0,
            USDC.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
            angleRouter.address,
            UNIT_USDC,
            'USDC',
          ),
          await signPermit(
            user,
            0,
            sanTokenWBTC.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
            angleRouter.address,
            REWARD_SANWBTC,
            'san_wBTC',
          ),
        ];

        const transfers: TypeTransfer[] = [
          { inToken: wBTC.address, amountIn: UNIT_WBTC },
          { inToken: DAI.address, amountIn: UNIT_DAI },
        ];

        const payload1inch = oneInchRouter.interface.encodeFunctionData('swap', [
          ethers.constants.AddressZero,
          {
            srcToken: USDC.address,
            dstToken: DAI.address,
            srcReceiver: oneInchRouter.address,
            dstReceiver: angleRouter.address,
            amount: UNIT_USDC,
            minReturnAmount: BigNumber.from(0),
            flags: BigNumber.from(0),
            permit: '0x',
          },
          '0x',
        ]);

        const swaps: TypeSwap[] = [
          {
            inToken: USDC.address,
            collateral: DAI.address,
            amountIn: UNIT_USDC,
            minAmountOut: parseAmount.ether(USDCORACLEUSD),
            args: payload1inch,
            swapType: SwapType.oneINCH,
          },
          {
            inToken: wETH.address,
            collateral: DAI.address,
            amountIn: UNIT_ETH,
            minAmountOut: parseAmount.ether(ETHORACLEUSD),
            args: '0x',
            swapType: SwapType.UniswapV3,
          },
        ];

        const actions = [
          ActionType.claimWeeklyInterest,
          ActionType.claimWeeklyInterest,
          ActionType.gaugeDeposit,
          ActionType.mint,
          ActionType.mint,
          ActionType.openPerpetual,
          ActionType.openPerpetual,
        ];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'address', 'bool'],
            [user.address, interestDistributorAgEUR.address, false],
          ),
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'address', 'bool'],
            [user.address, interestDistributorSanwBTCEUR.address, true],
          ),
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'address', 'address', 'bool'],
            [user.address, BASE_PARAMS, sanTokenWBTC.address, gaugeSanEURWBTC.address, false],
          ),
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'bool', 'address', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS.div(BigNumber.from(2)),
              ethers.constants.Zero,
              false,
              agEUR.address,
              wBTC.address,
              ethers.constants.AddressZero,
            ],
          ),
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'bool', 'address', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS.mul(BigNumber.from(3)).div(BigNumber.from(4)),
              ethers.constants.Zero,
              false,
              agEUR.address,
              DAI.address,
              ethers.constants.AddressZero,
            ],
          ),
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'uint256', 'uint256', 'bool', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS,
              UNIT_DAI,
              DAIORACLEUSD.mul(BASE_18),
              BigNumber.from(0),
              false,
              agEUR.address,
              DAI.address,
            ],
          ),
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'uint256', 'uint256', 'uint256', 'bool', 'address', 'address'],
            [
              user.address,
              BASE_PARAMS,
              UNIT_WBTC,
              wBTCORACLEUSD.mul(BASE_18),
              BigNumber.from(0),
              false,
              agEUR.address,
              wBTC.address,
            ],
          ),
        ];
        await (await angleRouter.connect(user).mixer(permits, transfers, swaps, actions, datas)).wait();

        BALANCE_DAI = BALANCE_DAI.sub(UNIT_DAI);
        BALANCE_WBTC = BALANCE_WBTC.sub(UNIT_WBTC);
        BALANCE_USDC = BALANCE_USDC.sub(UNIT_USDC);
        BALANCE_ETH = BALANCE_ETH.sub(UNIT_ETH);
        BALANCE_gaugeSanWBTC = BALANCE_gaugeSanWBTC.add(REWARD_SANWBTC);
        BALANCE_AGEUR = BALANCE_AGEUR.add(REWARD_AGEUR)
          .add(BigNumber.from(3).mul(BASE_18))
          .add(BigNumber.from(15).mul(BASE_18));

        const perpDataDAI = await perpEURDAI.perpetualData(BigNumber.from(1));
        const perpDataWBTC = await perpEURWBTC.perpetualData(BigNumber.from(1));
        expect(await perpDataDAI.margin).to.be.equal(UNIT_DAI);
        expect(await perpDataDAI.committedAmount).to.be.equal(UNIT_DAI);
        expect(await perpDataDAI.entryRate).to.be.equal(parseAmount.ether(DAIORACLEUSD));
        expect(await perpDataWBTC.margin).to.be.equal(UNIT_WBTC.div(BigNumber.from(2)));
        expect(await perpDataWBTC.committedAmount).to.be.equal(UNIT_WBTC);
        expect(await perpDataWBTC.entryRate).to.be.equal(parseAmount.ether(wBTCORACLEUSD));

        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
        await invariantFundsUser();
      });
      it('wait for the rewards to grow', async () => {
        await (await ANGLE.connect(governor).mint(governor.address, REWARD_ANGLE.mul(BigNumber.from(4)))).wait();
        // deposit directly rewards tokens for testing purpose
        await (await ANGLE.connect(governor).mint(perpEURWBTC.address, REWARD_ANGLE)).wait();
        await (await ANGLE.connect(governor).mint(perpEURDAI.address, REWARD_ANGLE)).wait();
        await await perpEURDAI.connect(governor).notifyRewardAmount(REWARD_ANGLE);
        await await perpEURWBTC.connect(governor).notifyRewardAmount(REWARD_ANGLE);

        await (await ANGLE.connect(governor).approve(gaugeSanEURWBTC.address, ethers.constants.MaxUint256)).wait();
        await (await gaugeSanEURWBTC.connect(governor).deposit_reward_token(ANGLE.address, REWARD_ANGLE)).wait();
        await (await ANGLE.connect(governor).approve(gaugeSanEURDAI.address, ethers.constants.MaxUint256)).wait();
        await (await gaugeSanEURDAI.connect(governor).deposit_reward_token(ANGLE.address, REWARD_ANGLE)).wait();

        // letting time goes to be on next week --> possibility to claim reward for the past week
        await network.provider.send('evm_increaseTime', [WEEK]);
        await network.provider.send('evm_mine');
        await interestDistributorAgEUR.connect(governor).checkpoint_token();
        await interestDistributorSanwBTCEUR.connect(governor).checkpoint_token();
      });

      it('success - claimRewards and add', async () => {
        await perpEURWBTC.connect(user).setApprovalForAll(angleRouter.address, true);
        await perpEURDAI.connect(user).setApprovalForAll(angleRouter.address, true);

        const claimableOnEUR = await gaugeEUR.connect(user).claimable_reward(user.address, ANGLE.address);
        const claimableOnSanDAI = await gaugeSanEURDAI.connect(user).claimable_reward(user.address, ANGLE.address);
        const claimableOnSANWBTC = await gaugeSanEURWBTC.connect(user).claimable_reward(user.address, ANGLE.address);
        const claimableOnWBTC = await perpEURWBTC.connect(user).earned(BigNumber.from(1));
        const claimableOnDAI = await perpEURDAI.connect(user).earned(BigNumber.from(1));
        const sumRewards = claimableOnEUR
          .add(claimableOnSanDAI)
          .add(claimableOnSANWBTC)
          .add(claimableOnDAI.add(claimableOnWBTC));

        const permits: TypePermit[] = [
          await signPermit(
            user,
            1,
            wBTC.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
            angleRouter.address,
            UNIT_WBTC,
            'wBTC',
          ),
        ];

        const transfers: TypeTransfer[] = [{ inToken: wBTC.address, amountIn: UNIT_WBTC }];
        const swaps: TypeSwap[] = [];

        const actions = [
          ActionType.claimRewards,
          // the two actions nullify themselves
          ActionType.deposit,
          ActionType.withdraw,
          ActionType.addToPerpetual,
        ];
        const datas: string[] = [
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'address[]', 'uint256[]', 'bool', 'address[]', 'address[]'],
            [
              user.address,
              ethers.constants.Zero,
              [gaugeEUR.address, gaugeSanEURDAI.address, gaugeSanEURWBTC.address],
              [BigNumber.from(1), BigNumber.from(1)],
              false,
              [agEUR.address, agEUR.address],
              [wBTC.address, DAI.address],
            ],
          ),
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
            ['uint256', 'bool', 'address', 'address', 'address'],
            [BASE_PARAMS, false, agEUR.address, wBTC.address, sanTokenWBTC.address],
          ),
          ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256', 'bool', 'address', 'address'],
            [BASE_PARAMS, BigNumber.from(1), false, agEUR.address, wBTC.address],
          ),
        ];
        await (await angleRouter.connect(user).mixer(permits, transfers, swaps, actions, datas)).wait();

        BALANCE_WBTC = BALANCE_WBTC.sub(UNIT_WBTC);
        BALANCE_ANGLE = BALANCE_ANGLE.add(sumRewards);

        const perpDataWBTC = await perpEURWBTC.perpetualData(BigNumber.from(1));
        expect(await perpDataWBTC.margin).to.be.equal(UNIT_WBTC.mul(BigNumber.from(3)).div(BigNumber.from(2)));
        expect(await perpDataWBTC.committedAmount).to.be.equal(UNIT_WBTC);
        expect(await perpDataWBTC.entryRate).to.be.equal(parseAmount.ether(wBTCORACLEUSD));

        await invariantFunds(angleRouter.address);
        await invariantFunds(cleanAddress.address);
        await invariantFundsUser();
      });
    });
    describe('Wrapper functions', () => {
      it('claimRewards n°1', async () => {
        await angleRouter
          .connect(user)
          ['claimRewards(address,address[],uint256[],address[],address[])'](
            user.address,
            [gaugeEUR.address, gaugeSanEURDAI.address, gaugeSanEURWBTC.address],
            [BigNumber.from(1), BigNumber.from(1)],
            [agEUR.address, agEUR.address],
            [wBTC.address, DAI.address],
          );
      });
      it('claimRewards n°2', async () => {
        await angleRouter
          .connect(user)
          ['claimRewards(address,address[],uint256[],address[])'](
            user.address,
            [gaugeEUR.address, gaugeSanEURDAI.address, gaugeSanEURWBTC.address],
            [BigNumber.from(1), BigNumber.from(1)],
            [perpEURWBTC.address, perpEURDAI.address],
          );
      });
      it('Deposit n°1', async () => {
        await (await wBTC.connect(user).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();

        await (await wBTC.connect(governor).mint(user.address, UNIT_WBTC)).wait();

        await angleRouter
          .connect(user)
          ['deposit(address,uint256,address,address)'](user.address, UNIT_WBTC, agEUR.address, wBTC.address);
      });
      it('Deposit n°2', async () => {
        await (await wBTC.connect(user).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();

        await (await wBTC.connect(governor).mint(user.address, UNIT_WBTC)).wait();

        await angleRouter
          .connect(user)
          ['deposit(address,uint256,address,address,address,address)'](
            user.address,
            UNIT_WBTC,
            stableMasterEUR.address,
            wBTC.address,
            managerWBTC.address,
            sanTokenWBTC.address,
          );
      });
      it('Gauge Deposit', async () => {
        await (await sanTokenWBTC.connect(user).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();

        await angleRouter
          .connect(user)
          .gaugeDeposit(user.address, UNIT_WBTC, gaugeSanEURWBTC.address, false, sanTokenWBTC.address);
      });
      it('Mint n°1', async () => {
        await (await wBTC.connect(user).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();

        await (await wBTC.connect(governor).mint(user.address, UNIT_WBTC)).wait();

        await angleRouter
          .connect(user)
          ['mint(address,uint256,uint256,address,address)'](
            user.address,
            UNIT_WBTC,
            UNIT_DAI,
            agEUR.address,
            wBTC.address,
          );
      });
      it('Mint n°2', async () => {
        await (await wBTC.connect(user).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();

        await (await wBTC.connect(governor).mint(user.address, UNIT_WBTC)).wait();

        await angleRouter
          .connect(user)
          ['mint(address,uint256,uint256,address,address,address)'](
            user.address,
            UNIT_WBTC,
            UNIT_DAI,
            stableMasterEUR.address,
            wBTC.address,
            managerWBTC.address,
          );
      });

      it('Open Perp', async () => {
        await (await wBTC.connect(user).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();

        await (await wBTC.connect(governor).mint(user.address, UNIT_WBTC)).wait();

        await angleRouter
          .connect(user)
          .openPerpetual(
            user.address,
            UNIT_WBTC,
            UNIT_WBTC,
            wBTCORACLEUSD.mul(BASE_18),
            BigNumber.from(0),
            false,
            agEUR.address,
            wBTC.address,
          );
      });
      it('add to perpetual', async () => {
        await (await wBTC.connect(user).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();

        await (await wBTC.connect(governor).mint(user.address, UNIT_WBTC)).wait();

        await angleRouter
          .connect(user)
          .addToPerpetual(UNIT_WBTC, BigNumber.from(2), false, agEUR.address, wBTC.address);
      });
    });
  });
});
