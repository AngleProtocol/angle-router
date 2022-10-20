import hre, { ethers, network } from 'hardhat';
import { expect } from '../../utils/chai-setup';
import { BigNumber, ContractFactory } from 'ethers';

// we import our utilities
import {
  // functions
  initRouter,
  initCollateral,
  initToken,
  initGaugeFork,
  BASE_PARAMS,
  TypeTransfer,
  TypeSwap,
  ActionType,
  WEEK,
  TypePermit,
} from '../../utils/helpers';

import { AngleRouter, MockANGLE, MockTokenPermit, Mock1Inch, MockUniswapV3Router } from '../../typechain';

import {
  AgToken,
  AngleDistributor,
  LiquidityGaugeV4,
  ANGLE as ANGLEType,
  PerpetualManagerFront,
  PoolManager,
  SanToken,
  StableMasterFront,
  VeANGLE,
  VeBoostProxy,
  VeANGLE__factory,
  VeBoostProxy__factory,
  AngleDistributor__factory,
  StableMasterFront__factory,
  AgToken__factory,
  ANGLE__factory,
} from '../../typechain/core';
import { BASE_18, ChainId, CONTRACTS_ADDRESSES, formatAmount, parseAmount } from '@angleprotocol/sdk';
import { impersonate } from '../../utils/helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { signPermit } from '../../utils/sign';

let ANGLE: ANGLEType;
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

let deployer: SignerWithAddress;
let guardian: SignerWithAddress;
let user: SignerWithAddress;
let user2: SignerWithAddress;
let cleanAddress: SignerWithAddress;
let governor: SignerWithAddress;

let governorOrGuardianError: string;

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

let startTs: number;

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
  // expect(await veANGLE['balanceOf(address)'](owner)).to.be.equal(ethers.constants.Zero);
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
describe('AngleRouter - claim and lock', () => {
  before(async () => {
    startTs = await (await ethers.provider.getBlock('latest')).timestamp;

    [deployer, guardian, user, user2, cleanAddress] = await ethers.getSigners();
    const governorAddress = '0xdC4e6DFe07EFCa50a197DF15D9200883eF4Eb1c8';
    governor = await impersonate(governorAddress, undefined, false);
    await hre.network.provider.send('hardhat_setBalance', [governor.address, '0x10000000000000000000000000000']);

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

    const contracts = CONTRACTS_ADDRESSES[1 as ChainId];

    ANGLE = new ethers.Contract(contracts.ANGLE!, ANGLE__factory.abi, deployer) as ANGLEType;
    veANGLE = new ethers.Contract(contracts.veANGLE!, VeANGLE__factory.abi, deployer) as VeANGLE;
    veBoostProxy = new ethers.Contract(contracts.veBoostProxy!, VeBoostProxy__factory.abi, deployer) as VeBoostProxy;
    angleDistributor = new ethers.Contract(
      contracts.AngleDistributor!,
      AngleDistributor__factory.abi,
      deployer,
    ) as AngleDistributor;
    stableMasterEUR = new ethers.Contract(
      contracts.agEUR?.StableMaster!,
      StableMasterFront__factory.abi,
      deployer,
    ) as StableMasterFront;
    agEUR = new ethers.Contract(contracts.agEUR?.AgToken!, AgToken__factory.abi, deployer) as AgToken;

    // Mint tokens of all type to user
    UNIT_DAI = BigNumber.from(10).pow(DAIdecimal);
    UNIT_ETH = BigNumber.from(10).pow(ETHdecimal);
    UNIT_WBTC = BigNumber.from(10).pow(wBTCdecimal);
    BALANCE_AGEUR = ethers.constants.Zero;
    BALANCE_ANGLE = BigNumber.from(1_000_000).mul(BASE_18);
    BALANCE_ETH = BigNumber.from(50).mul(BigNumber.from(10).pow(ETHdecimal));
    BALANCE_USDC = BigNumber.from(50).mul(BigNumber.from(10).pow(USDCdecimal));
    BALANCE_WBTC = BigNumber.from(50).mul(BigNumber.from(10).pow(wBTCdecimal));
    BALANCE_DAI = BigNumber.from(50).mul(BigNumber.from(10).pow(DAIdecimal));
    BALANCE_GOV_WBTC = BigNumber.from(50).mul(BigNumber.from(10).pow(wBTCdecimal));

    BALANCE2_ANGLE = BigNumber.from(1_000_000).mul(BASE_18);
  });
  beforeEach(async () => {
    // If the forked-network state needs to be reset between each test, run this
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: hre.config.networks.hardhat.forking
            ? {
                jsonRpcUrl: hre.config.networks.hardhat.forking.url,
              }
            : undefined,
        },
      ],
    });

    ({
      token: wBTC,
      manager: managerWBTC,
      sanToken: sanTokenWBTC,
      perpetualManager: perpEURWBTC,
    } = await initCollateral(
      'wBTC',
      stableMasterEUR,
      ANGLE as unknown as MockANGLE,
      governor,
      wBTCdecimal,
      wBTCORACLEUSD,
      0,
      false,
    ));
    ({
      token: DAI,
      manager: managerDAI,
      sanToken: sanTokenDAI,
      perpetualManager: perpEURDAI,
    } = await initCollateral(
      'DAI',
      stableMasterEUR,
      ANGLE as unknown as MockANGLE,
      governor,
      DAIdecimal,
      DAIORACLEUSD,
      0,
      false,
    ));

    ({ gauge: gaugeSanEURWBTC } = await initGaugeFork(sanTokenWBTC.address, governor, ANGLE, veANGLE, veBoostProxy));
    ({ gauge: gaugeSanEURDAI } = await initGaugeFork(sanTokenDAI.address, governor, ANGLE, veANGLE, veBoostProxy));
    ({ gauge: gaugeSanEURWBTC2 } = await initGaugeFork(sanTokenWBTC.address, governor, ANGLE, veANGLE, veBoostProxy));
    ({ gauge: gaugeEUR } = await initGaugeFork(agEUR.address, governor, ANGLE, veANGLE, veBoostProxy));

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

    await (await wBTC.connect(governor).mint(user.address, BALANCE_WBTC)).wait();
    await (await wETH.connect(governor).mint(user.address, BALANCE_ETH)).wait();
    await (await USDC.connect(governor).mint(user.address, BALANCE_USDC)).wait();
    await (await DAI.connect(governor).mint(user.address, BALANCE_DAI)).wait();
    await (await ANGLE.connect(governor).transfer(cleanAddress.address, BALANCE2_ANGLE)).wait();
    await (await ANGLE.connect(governor).transfer(user.address, BALANCE_ANGLE)).wait();
    await (await wBTC.connect(governor).mint(governor.address, BALANCE_GOV_WBTC)).wait();

    await (await wBTC.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await sanTokenWBTC.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await sanTokenDAI.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();

    await (await wETH.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await USDC.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await DAI.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await ANGLE.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await wETH.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();

    await (await ANGLE.connect(user).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    // lock
    await (await ANGLE.connect(user).approve(veANGLE.address, ethers.constants.MaxUint256)).wait();
    await veANGLE.connect(user).create_lock(BALANCE_ANGLE, BigNumber.from(startTs).add(BigNumber.from(WEEK * 53 * 3)));
    await (await ANGLE.connect(cleanAddress).approve(veANGLE.address, ethers.constants.MaxUint256)).wait();
    await veANGLE
      .connect(cleanAddress)
      .create_lock(BALANCE2_ANGLE, BigNumber.from(startTs).add(BigNumber.from(WEEK * 53 * 3)));

    // stake in gauges and open perp
    await (await perpEURWBTC.connect(user).setApprovalForAll(angleRouter.address, true)).wait();
    await (await perpEURDAI.connect(user).setApprovalForAll(angleRouter.address, true)).wait();

    const permits: TypePermit[] = [
      await signPermit(
        user,
        0,
        wBTC.address,
        Number(await (await ethers.provider.getBlock('latest')).timestamp) + 1000,
        angleRouter.address,
        ethers.constants.MaxUint256,
        'wBTC',
      ),
      await signPermit(
        user,
        0,
        sanTokenWBTC.address,
        Number(await (await ethers.provider.getBlock('latest')).timestamp) + 1000,
        angleRouter.address,
        ethers.constants.MaxUint256,
        'san_wBTC',
      ),
      await signPermit(
        user,
        0,
        DAI.address,
        Number(await (await ethers.provider.getBlock('latest')).timestamp) + 1000,
        angleRouter.address,
        ethers.constants.MaxUint256,
        'DAI',
      ),
      await signPermit(
        user,
        0,
        sanTokenDAI.address,
        Number(await (await ethers.provider.getBlock('latest')).timestamp) + 1000,
        angleRouter.address,
        ethers.constants.MaxUint256,
        'san_DAI',
      ),
      await signPermit(
        user,
        0,
        ANGLE.address,
        Number(await (await ethers.provider.getBlock('latest')).timestamp) + 1000,
        angleRouter.address,
        ethers.constants.MaxUint256,
        'ANGLE',
      ),
    ];
    const transfers: TypeTransfer[] = [
      {
        inToken: wBTC.address,
        receiver: angleRouter.address,
        amountIn: UNIT_WBTC.mul(BigNumber.from(9)).div(BigNumber.from(4)),
      },
      {
        inToken: DAI.address,
        receiver: angleRouter.address,
        amountIn: UNIT_DAI.mul(BigNumber.from(9)).div(BigNumber.from(4)),
      },
    ];
    const swaps: TypeSwap[] = [];
    const actions = [
      ActionType.deposit,
      ActionType.gaugeDeposit,
      ActionType.deposit,
      ActionType.gaugeDeposit,
      ActionType.mint,
      ActionType.openPerpetual,
      ActionType.mint,
      ActionType.openPerpetual,
    ];
    const datas: string[] = [
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'bool', 'address', 'address', 'address', 'address'],
        [
          angleRouter.address,
          BASE_PARAMS.mul(BigNumber.from(4)).div(BigNumber.from(9)),
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
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'bool', 'address', 'address', 'address', 'address'],
        [
          angleRouter.address,
          BASE_PARAMS.mul(BigNumber.from(4)).div(BigNumber.from(9)),
          false,
          agEUR.address,
          DAI.address,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
        ],
      ),
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'address', 'address', 'bool'],
        [user.address, BASE_PARAMS, sanTokenDAI.address, gaugeSanEURDAI.address, false],
      ),
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
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'uint256', 'bool', 'address', 'address', 'address'],
        [
          user.address,
          BASE_PARAMS.mul(BigNumber.from(4)).div(BigNumber.from(5)),
          parseAmount.ether(DAIORACLEUSD),
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
          UNIT_WBTC.div(BigNumber.from(4)),
          parseAmount.ether(DAIORACLEUSD),
          BigNumber.from(0),
          false,
          agEUR.address,
          DAI.address,
        ],
      ),
    ];
    await (await angleRouter.connect(user).mixer(permits, transfers, swaps, actions, datas)).wait();

    await invariantFunds(angleRouter.address);
    await invariantFunds(cleanAddress.address);
    // letting some time goes by to have significant ANGLE amount
    await network.provider.send('evm_increaseTime', [WEEK]);
    await network.provider.send('evm_mine');

    await (await perpEURWBTC.connect(user).setApprovalForAll(angleRouter.address, true)).wait();
    await (await perpEURDAI.connect(user).setApprovalForAll(angleRouter.address, true)).wait();
  });
  describe('claimRewards', () => {
    it('revert - impossible to lock for someone else without funds', async () => {
      const actions = [ActionType.claimRewards, ActionType.veANGLEDeposit];
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
        ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [user.address, BASE_PARAMS]),
      ];
      await expect(angleRouter.connect(cleanAddress).mixer([], [], [], actions, datas)).to.be.revertedWith(
        'ERC20: transfer amount exceeds balance',
      );
    });
    it('success - claim and lock', async () => {
      await (await perpEURWBTC.connect(user).setApprovalForAll(angleRouter.address, true)).wait();
      await (await perpEURDAI.connect(user).setApprovalForAll(angleRouter.address, true)).wait();

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

      const actions = [ActionType.claimRewards, ActionType.veANGLEDeposit];
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
        ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [user.address, BASE_PARAMS]),
      ];
      await (await angleRouter.connect(user).mixer([], [], [], actions, datas)).wait();

      const newLockedUser = BALANCE_ANGLE.add(sumRewards);
      const newLockedCleanAddress = BALANCE2_ANGLE;

      // check new locked ANGLE
      const lockUser = await veANGLE.connect(user).locked(user.address);
      const lockCleanAddress = await veANGLE.connect(user).locked(cleanAddress.address);

      expect(lockUser[0]).to.be.equal(newLockedUser);
      expect(lockCleanAddress[0]).to.be.equal(newLockedCleanAddress);

      await invariantFunds(angleRouter.address);
      await invariantFunds(cleanAddress.address);
      expect(await ANGLE.balanceOf(user.address)).to.be.equal(balanceAnglePre);
    });

    it('success - external claim and lock for you', async () => {
      await (await perpEURWBTC.connect(user).setApprovalForAll(angleRouter.address, true)).wait();
      await (await perpEURDAI.connect(user).setApprovalForAll(angleRouter.address, true)).wait();

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

      await (await ANGLE.connect(governor).transfer(cleanAddress.address, sumRewards)).wait();

      const actions = [ActionType.claimRewards, ActionType.veANGLEDeposit];
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
        ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [user.address, BASE_PARAMS]),
      ];
      await (await angleRouter.connect(cleanAddress).mixer([], [], [], actions, datas)).wait();

      const newLockedUser = BALANCE_ANGLE.add(sumRewards);
      const newLockedCleanAddress = BALANCE2_ANGLE;

      // check new locked ANGLE
      const lockUser = await veANGLE.connect(user).locked(user.address);
      const lockCleanAddress = await veANGLE.connect(user).locked(cleanAddress.address);

      expect(lockUser[0]).to.be.equal(newLockedUser);
      expect(lockCleanAddress[0]).to.be.equal(newLockedCleanAddress);

      await invariantFunds(angleRouter.address);
      await invariantFunds(cleanAddress.address);
      expect(await ANGLE.balanceOf(user.address)).to.be.equal(balanceAnglePre.add(sumRewards));
    });
  });
});
