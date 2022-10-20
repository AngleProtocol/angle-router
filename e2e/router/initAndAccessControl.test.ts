import hre, { ethers } from 'hardhat';
import { expect } from '../../utils/chai-setup';
import { BigNumber, ContractFactory } from 'ethers';

// we import our utilities
import {
  // functions
  initRouter,
  initCollateral,
  initToken,
  initGaugeFork,
} from '../../utils/helpers';

import {
  AngleRouter,
  MockANGLE,
  MockTokenPermit,
  MockUniswapV3Router,
  Mock1Inch,
  AngleRouter__factory,
} from '../../typechain';

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
import { BASE_18, ChainId, CONTRACTS_ADDRESSES } from '@angleprotocol/sdk';
import { impersonate } from '../../utils/helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

let ANGLE: ANGLEType;
let veANGLE: VeANGLE;
let veBoostProxy: VeBoostProxy;
let angleDistributor: AngleDistributor;
let stableMasterEUR: StableMasterFront;
let agEUR: AgToken;

let angleRouter: AngleRouter;
let uniswapRouter: MockUniswapV3Router;
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

let deployer: SignerWithAddress;
let guardian: SignerWithAddress;
let user: SignerWithAddress;
let user2: SignerWithAddress;
let cleanAddress: SignerWithAddress;
let governor: SignerWithAddress;

let governorOrGuardianError: string;

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
describe('AngleRouter - init & access control', () => {
  before(async () => {
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

    ({ angleRouter, uniswapRouter, oneInchRouter } = await initRouter(
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
    UNIT_DAI = BigNumber.from(10).pow(DAIdecimal);
    BALANCE_AGEUR = ethers.constants.Zero;
    BALANCE_ETH = BigNumber.from(50).mul(BigNumber.from(10).pow(ETHdecimal));
    BALANCE_USDC = BigNumber.from(50).mul(BigNumber.from(10).pow(USDCdecimal));
    BALANCE_WBTC = BigNumber.from(50).mul(BigNumber.from(10).pow(wBTCdecimal));
    BALANCE_DAI = BigNumber.from(50).mul(BigNumber.from(10).pow(DAIdecimal));
    BALANCE_GOV_WBTC = BigNumber.from(50).mul(BigNumber.from(10).pow(wBTCdecimal));

    BALANCE2_ANGLE = BigNumber.from(1_000_000).mul(BASE_18);

    await (await wBTC.connect(governor).mint(user.address, BALANCE_WBTC)).wait();
    await (await wETH.connect(governor).mint(user.address, BALANCE_ETH)).wait();
    await (await USDC.connect(governor).mint(user.address, BALANCE_USDC)).wait();
    await (await DAI.connect(governor).mint(user.address, BALANCE_DAI)).wait();
    await (await ANGLE.connect(governor).transfer(user2.address, BALANCE2_ANGLE)).wait();
    await (await wBTC.connect(governor).mint(governor.address, BALANCE_GOV_WBTC)).wait();

    await (await wBTC.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await sanTokenWBTC.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await sanTokenDAI.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();

    await (await wETH.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await USDC.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await DAI.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await ANGLE.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();
    await (await wETH.connect(cleanAddress).approve(angleRouter.address, ethers.constants.MaxUint256)).wait();

    governorOrGuardianError = '115';
  });

  describe('Init', () => {
    describe('Initializer', () => {
      //   it('revert - governor - zero address', async () => {
      //     const angleRouter = (await new AngleRouter__factory(deployer).deploy()) as AngleRouter;
      //     await expect(
      //       angleRouter
      //         .connect(governor)
      //         .initialize(
      //           ethers.constants.AddressZero,
      //           guardian.address,
      //           uniswapRouter.address,
      //           oneInchRouter.address,
      //           stableMasterEUR.address,
      //           [managerWBTC.address, managerDAI.address],
      //           [gaugeSanEURWBTC.address, gaugeSanEURDAI.address],
      //         ),
      //     ).to.be.revertedWith('0');
      //   });
      //   it('revert - guardian - zero address', async () => {
      //     const angleRouter = (await new AngleRouter__factory(deployer).deploy()) as AngleRouter;
      //     await expect(
      //       angleRouter
      //         .connect(governor)
      //         .initialize(
      //           governor.address,
      //           ethers.constants.AddressZero,
      //           uniswapRouter.address,
      //           oneInchRouter.address,
      //           stableMasterEUR.address,
      //           [managerWBTC.address, managerDAI.address],
      //           [gaugeSanEURWBTC.address, gaugeSanEURDAI.address],
      //         ),
      //     ).to.be.revertedWith('0');
      //   });
      //   it('revert - governor same as guardian', async () => {
      //     const angleRouter = (await new AngleRouter__factory(deployer).deploy()) as AngleRouter;
      //     await expect(
      //       angleRouter
      //         .connect(governor)
      //         .initialize(
      //           guardian.address,
      //           guardian.address,
      //           uniswapRouter.address,
      //           oneInchRouter.address,
      //           stableMasterEUR.address,
      //           [managerWBTC.address, managerDAI.address],
      //           [gaugeSanEURWBTC.address, gaugeSanEURDAI.address],
      //         ),
      //     ).to.be.revertedWith('49');
      //   });
      //   it('revert - uniswapRouter - zero address', async () => {
      //     const angleRouter = (await new AngleRouter__factory(deployer).deploy()) as AngleRouter;
      //     await expect(
      //       angleRouter
      //         .connect(governor)
      //         .initialize(
      //           governor.address,
      //           guardian.address,
      //           ethers.constants.AddressZero,
      //           oneInchRouter.address,
      //           stableMasterEUR.address,
      //           [managerWBTC.address, managerDAI.address],
      //           [gaugeSanEURWBTC.address, gaugeSanEURDAI.address],
      //         ),
      //     ).to.be.revertedWith('0');
      //   });
      //   it('revert - 1InchRouter - zero address', async () => {
      //     const angleRouter = (await new AngleRouter__factory(deployer).deploy()) as AngleRouter;
      //     await expect(
      //       angleRouter
      //         .connect(governor)
      //         .initialize(
      //           governor.address,
      //           guardian.address,
      //           uniswapRouter.address,
      //           ethers.constants.AddressZero,
      //           stableMasterEUR.address,
      //           [managerWBTC.address, managerDAI.address],
      //           [gaugeSanEURWBTC.address, gaugeSanEURDAI.address],
      //         ),
      //     ).to.be.revertedWith('0');
      //   });
      //   it('revert - stablemaster - zero address', async () => {
      //     const angleRouter = (await new AngleRouter__factory(deployer).deploy()) as AngleRouter;
      //     await expect(
      //       angleRouter
      //         .connect(governor)
      //         .initialize(
      //           governor.address,
      //           guardian.address,
      //           uniswapRouter.address,
      //           oneInchRouter.address,
      //           ethers.constants.AddressZero,
      //           [managerWBTC.address, managerDAI.address],
      //           [gaugeSanEURWBTC.address, gaugeSanEURDAI.address],
      //         ),
      //     ).to.be.reverted;
      //   });
      //   it('revert - poolManagers - invalid array length', async () => {
      //     const angleRouter = (await new AngleRouter__factory(deployer).deploy()) as AngleRouter;
      //     await expect(
      //       angleRouter
      //         .connect(governor)
      //         .initialize(
      //           governor.address,
      //           guardian.address,
      //           uniswapRouter.address,
      //           oneInchRouter.address,
      //           stableMasterEUR.address,
      //           [managerWBTC.address],
      //           [gaugeSanEURWBTC.address, gaugeSanEURDAI.address],
      //         ),
      //     ).to.be.revertedWith('104');
      //   });
      //   it('revert - gauges - invalid array length', async () => {
      //     const angleRouter = (await new AngleRouter__factory(deployer).deploy()) as AngleRouter;
      //     await expect(
      //       angleRouter
      //         .connect(governor)
      //         .initialize(
      //           governor.address,
      //           guardian.address,
      //           uniswapRouter.address,
      //           oneInchRouter.address,
      //           stableMasterEUR.address,
      //           [managerWBTC.address, managerDAI.address],
      //           [gaugeSanEURDAI.address],
      //         ),
      //     ).to.be.revertedWith('104');
      //   });
      //   it('revert - poolManagers - zero address', async () => {
      //     const angleRouter = (await new AngleRouter__factory(deployer).deploy()) as AngleRouter;
      //     await expect(
      //       angleRouter
      //         .connect(governor)
      //         .initialize(
      //           governor.address,
      //           guardian.address,
      //           uniswapRouter.address,
      //           oneInchRouter.address,
      //           stableMasterEUR.address,
      //           [managerWBTC.address, ethers.constants.AddressZero],
      //           [gaugeSanEURWBTC.address, gaugeSanEURDAI.address],
      //         ),
      //     ).to.be.reverted;
      //   });
      //   it('revert - duplicated poolManager', async () => {
      //     const angleRouter = (await new AngleRouter__factory(deployer).deploy()) as AngleRouter;
      //     await expect(
      //       angleRouter
      //         .connect(governor)
      //         .initialize(
      //           governor.address,
      //           guardian.address,
      //           uniswapRouter.address,
      //           oneInchRouter.address,
      //           stableMasterEUR.address,
      //           [managerWBTC.address, managerWBTC.address],
      //           [gaugeSanEURWBTC.address, gaugeSanEURDAI.address],
      //         ),
      //     ).to.be.revertedWith('114');
      //   });
      //   it('revert - gauge - wrong contract', async () => {
      //     const angleRouter = (await new AngleRouter__factory(deployer).deploy()) as AngleRouter;
      //     await expect(
      //       angleRouter.initialize(
      //         governor.address,
      //         guardian.address,
      //         uniswapRouter.address,
      //         oneInchRouter.address,
      //         stableMasterEUR.address,
      //         [managerWBTC.address, managerDAI.address],
      //         [gaugeSanEURWBTC.address, gaugeSanEURWBTC.address],
      //       ),
      //     ).to.be.revertedWith('20');
      //   });
    });
    describe('Parameters', () => {
      it('uniswapRouter', async () => {
        expect(await angleRouter.uniswapV3Router()).to.be.equal(uniswapRouter.address);
      });
      it('stablecoin mapping', async () => {
        expect(await angleRouter.mapStableMasters(agEUR.address)).to.be.equal(stableMasterEUR.address);
      });
      it('collaterals mapping - wBTC', async () => {
        const pairsContracts = await angleRouter.mapPoolManagers(stableMasterEUR.address, wBTC.address);
        expect(pairsContracts.poolManager).to.be.equal(managerWBTC.address);
        expect(pairsContracts.perpetualManager).to.be.equal(perpEURWBTC.address);
        expect(pairsContracts.sanToken).to.be.equal(sanTokenWBTC.address);
        expect(pairsContracts.gauge).to.be.equal(gaugeSanEURWBTC.address);
      });
      it('collaterals mapping - DAI', async () => {
        const pairsContracts = await angleRouter.mapPoolManagers(stableMasterEUR.address, DAI.address);
        expect(pairsContracts.poolManager).to.be.equal(managerDAI.address);
        expect(pairsContracts.perpetualManager).to.be.equal(perpEURDAI.address);
        expect(pairsContracts.sanToken).to.be.equal(sanTokenDAI.address);
        expect(pairsContracts.gauge).to.be.equal(gaugeSanEURDAI.address);
      });
    });
    describe('Approvals', () => {
      it('approval - ANGLE - to veANGLE', async () => {
        expect(await ANGLE.allowance(angleRouter.address, veANGLE.address)).to.be.equal(ethers.constants.MaxUint256);
      });
      it('approval - wBTC - to StableMaster', async () => {
        expect(await wBTC.allowance(angleRouter.address, stableMasterEUR.address)).to.be.equal(
          ethers.constants.MaxUint256,
        );
      });
      it('approval - wBTC - to PerpetualManager', async () => {
        expect(await wBTC.allowance(angleRouter.address, perpEURWBTC.address)).to.be.equal(ethers.constants.MaxUint256);
      });
      it('approval - sanBTC_EUR - to gauge', async () => {
        expect(await sanTokenWBTC.allowance(angleRouter.address, gaugeSanEURWBTC.address)).to.be.equal(
          ethers.constants.MaxUint256,
        );
      });

      it('approval - DAI - to StableMaster', async () => {
        expect(await DAI.allowance(angleRouter.address, stableMasterEUR.address)).to.be.equal(
          ethers.constants.MaxUint256,
        );
      });
      it('approval - DAI - to PerpetualManager', async () => {
        expect(await DAI.allowance(angleRouter.address, perpEURDAI.address)).to.be.equal(ethers.constants.MaxUint256);
      });
      it('approval - sanDAI_EUR - to gauge', async () => {
        expect(await sanTokenDAI.allowance(angleRouter.address, gaugeSanEURDAI.address)).to.be.equal(
          ethers.constants.MaxUint256,
        );
      });
    });
    describe('AccessControl', () => {
      it('governorOrGuardianRole - governor', async () => {
        expect(await angleRouter.governor()).to.be.equal(governor.address);
      });
      it('governorOrGuardianRole - guardian', async () => {
        expect(await angleRouter.guardian()).to.be.equal(guardian.address);
      });
      describe('setGovernorOrGuardian', () => {
        it('setGovernorOrGuardian - revert - onlyGovernorOrGuardian', async () => {
          await expect(angleRouter.connect(user).setGovernorOrGuardian(user.address, false)).to.be.revertedWith('115');
        });
        it('setGovernorOrGuardian - revert - zero address', async () => {
          await expect(
            angleRouter.connect(governor).setGovernorOrGuardian(ethers.constants.AddressZero, false),
          ).to.be.revertedWith('0');
        });
        it('setGovernorOrGuardian - revert - same guardian', async () => {
          await expect(angleRouter.connect(governor).setGovernorOrGuardian(guardian.address, false)).to.be.revertedWith(
            '49',
          );
        });
        it('setGovernorOrGuardian - revert - different than governor', async () => {
          await expect(angleRouter.connect(governor).setGovernorOrGuardian(governor.address, false)).to.be.revertedWith(
            '49',
          );
        });
        it('setGovernorOrGuardian - success - guardian', async () => {
          await (await angleRouter.connect(governor).setGovernorOrGuardian(user.address, false)).wait();
          expect(await angleRouter.guardian()).to.be.equal(user.address);
          await (await angleRouter.connect(user).setGovernorOrGuardian(guardian.address, false)).wait();
          expect(await angleRouter.guardian()).to.be.equal(guardian.address);
        });
        it('setGovernorOrGuardian - success - governor', async () => {
          await (await angleRouter.connect(governor).setGovernorOrGuardian(user.address, true)).wait();
          expect(await angleRouter.governor()).to.be.equal(user.address);
          await (await angleRouter.connect(user).setGovernorOrGuardian(governor.address, true)).wait();
          expect(await angleRouter.governor()).to.be.equal(governor.address);
        });
      });
      describe('Add and Remove - Collaterals ', () => {
        it('addPairs - revert - governor', async () => {
          await expect(
            angleRouter.connect(user).addPairs([agEUR.address], [managerWBTC.address], [ethers.constants.AddressZero]),
          ).to.be.revertedWith(governorOrGuardianError);
        });
        it('addPairs - revert invalid array size', async () => {
          await expect(
            angleRouter.connect(governor).addPairs([], [managerWBTC.address], [ethers.constants.AddressZero]),
          ).to.be.revertedWith('104');
          await expect(
            angleRouter.connect(governor).addPairs([agEUR.address], [], [ethers.constants.AddressZero]),
          ).to.be.revertedWith('104');
          await expect(
            angleRouter.connect(governor).addPairs([agEUR.address], [managerWBTC.address], []),
          ).to.be.revertedWith('104');
        });
        it('addPairs - revert zero address - wrong stablecoin ', async () => {
          await expect(
            angleRouter
              .connect(governor)
              .addPairs([wETH.address], [perpEURWBTC.address], [ethers.constants.AddressZero]),
          ).to.be.reverted;
        });
        it('addPairs - revert zero address - stablecoin ', async () => {
          await expect(
            angleRouter
              .connect(governor)
              .addPairs([ethers.constants.AddressZero], [perpEURWBTC.address], [ethers.constants.AddressZero]),
          ).to.be.reverted;
        });
        it('addPairs - revert non zero address - poolManager ', async () => {
          await expect(
            angleRouter.connect(governor).addPairs([agEUR.address], [managerWBTC.address], [gaugeEUR.address]),
          ).to.be.revertedWith('20');
        });
        it('addPairs - success - no gauge', async () => {
          await angleRouter
            .connect(governor)
            .addPairs([agEUR.address], [managerWBTC.address], [ethers.constants.AddressZero]);
          const pairsContracts = await angleRouter.mapPoolManagers(stableMasterEUR.address, wBTC.address);
          expect(pairsContracts.poolManager).to.be.equal(managerWBTC.address);
          expect(pairsContracts.perpetualManager).to.be.equal(perpEURWBTC.address);
          expect(pairsContracts.sanToken).to.be.equal(sanTokenWBTC.address);
          expect(pairsContracts.gauge).to.be.equal(ethers.constants.AddressZero);
          expect(await wBTC.allowance(angleRouter.address, stableMasterEUR.address)).to.be.equal(
            ethers.constants.MaxUint256,
          );
          expect(await wBTC.allowance(angleRouter.address, perpEURWBTC.address)).to.be.equal(
            ethers.constants.MaxUint256,
          );
          expect(await sanTokenWBTC.allowance(angleRouter.address, gaugeSanEURWBTC.address)).to.be.equal(
            BigNumber.from(0),
          );
        });
        it('addPairs - revert non zero address - perpetualManager ', async () => {
          await expect(
            angleRouter
              .connect(governor)
              .addPairs([agEUR.address], [managerWBTC.address], [ethers.constants.AddressZero]),
          ).to.be.revertedWith('114');
        });
        it('addPairs - success - gauge', async () => {
          // await angleRouter
          //   .connect(governor)
          //   .removePairs([agEUR.address], [wBTC.address], [ethers.constants.AddressZero]);
          // await angleRouter
          //   .connect(governor)
          //   .addPairs([agEUR.address], [managerWBTC.address], [gaugeSanEURWBTC.address]);
          const pairsContracts = await angleRouter.mapPoolManagers(stableMasterEUR.address, wBTC.address);
          expect(pairsContracts.poolManager).to.be.equal(managerWBTC.address);
          expect(pairsContracts.perpetualManager).to.be.equal(perpEURWBTC.address);
          expect(pairsContracts.sanToken).to.be.equal(sanTokenWBTC.address);
          expect(pairsContracts.gauge).to.be.equal(gaugeSanEURWBTC.address);
          expect(await wBTC.allowance(angleRouter.address, stableMasterEUR.address)).to.be.equal(
            ethers.constants.MaxUint256,
          );
          expect(await wBTC.allowance(angleRouter.address, perpEURWBTC.address)).to.be.equal(
            ethers.constants.MaxUint256,
          );
          expect(await sanTokenWBTC.allowance(angleRouter.address, gaugeSanEURWBTC.address)).to.be.equal(
            ethers.constants.MaxUint256,
          );
        });
      });
      describe('Add and Remove - Stablecoin ', () => {
        it('addStableMaster - revert - existingPool', async () => {
          await expect(
            angleRouter.connect(governor).addStableMaster(agEUR.address, stableMasterEUR.address),
          ).to.be.revertedWith('114');
        });
        it('addStableMaster - revert - governor', async () => {
          await expect(
            angleRouter.connect(user).addStableMaster(agEUR.address, stableMasterEUR.address),
          ).to.be.revertedWith(governorOrGuardianError);
        });
        it('addStableMaster - revert zero address - stablecoin ', async () => {
          await expect(
            angleRouter.connect(governor).addStableMaster(ethers.constants.AddressZero, stableMasterEUR.address),
          ).to.be.revertedWith('0');
        });
        it('addStableMaster - revert zero address - stableMaster ', async () => {
          await expect(angleRouter.connect(governor).addStableMaster(agEUR.address, ethers.constants.AddressZero)).to.be
            .reverted;
        });
        it('addStableMaster - revert wrong stablecoin ', async () => {
          await expect(
            angleRouter.connect(governor).addStableMaster(wETH.address, stableMasterEUR.address),
          ).to.be.revertedWith('20');
        });
        it('addStableMaster - success', async () => {
          await angleRouter.connect(governor).addStableMaster(agEUR.address, stableMasterEUR.address);
          expect(await angleRouter.mapStableMasters(agEUR.address)).to.be.equal(stableMasterEUR.address);
        });
        it('add all pairs - success', async () => {
          await angleRouter
            .connect(governor)
            .addPairs(
              [agEUR.address, agEUR.address],
              [managerDAI.address, managerWBTC.address],
              [gaugeSanEURDAI.address, gaugeSanEURWBTC.address],
            );
        });
        it('addStableMaster - success', async () => {
          await angleRouter.connect(governor).addStableMaster(agEUR.address, stableMasterEUR.address);
          expect(await angleRouter.mapStableMasters(agEUR.address)).to.be.equal(stableMasterEUR.address);
        });
        it('add all pairs - success', async () => {
          await angleRouter
            .connect(governor)
            .addPairs(
              [agEUR.address, agEUR.address],
              [managerDAI.address, managerWBTC.address],
              [gaugeSanEURDAI.address, gaugeSanEURWBTC.address],
            );
        });
      });
      describe('Add and Remove - LiquidityGauge ', () => {
        it('remove gauge - success', async () => {
          await angleRouter
            .connect(governor)
            .setLiquidityGauges([agEUR.address], [wBTC.address], [ethers.constants.AddressZero]);
          const pairsContracts = await angleRouter.mapPoolManagers(stableMasterEUR.address, wBTC.address);
          expect(pairsContracts.gauge).to.be.equal(ethers.constants.AddressZero);
          expect(await sanTokenWBTC.allowance(angleRouter.address, gaugeSanEURWBTC.address)).to.be.equal(
            BigNumber.from(0),
          );
        });
        it('add gauge - revert - governor', async () => {
          await expect(
            angleRouter.connect(user).setLiquidityGauges([agEUR.address], [wBTC.address], [gaugeSanEURWBTC.address]),
          ).to.be.revertedWith(governorOrGuardianError);
        });
        it('add gauge - revert zero address - stablecoin ', async () => {
          await expect(
            angleRouter
              .connect(governor)
              .setLiquidityGauges([ethers.constants.AddressZero], [wBTC.address], [gaugeSanEURWBTC.address]),
          ).to.be.revertedWith('0');
        });
        it('add gauge - revert zero address - stableMaster ', async () => {
          await expect(
            angleRouter.connect(governor).setLiquidityGauges([wETH.address], [wBTC.address], [gaugeSanEURWBTC.address]),
          ).to.be.revertedWith('0');
        });
        it('add gauge - revert zero address - poolManager', async () => {
          await expect(
            angleRouter.connect(user).setLiquidityGauges([agEUR.address], [USDC.address], [gaugeSanEURWBTC.address]),
          ).to.be.revertedWith(governorOrGuardianError);
        });
        it('add gauge - revert invalid array length', async () => {
          await expect(
            angleRouter.connect(governor).setLiquidityGauges([], [wBTC.address], [gaugeSanEURWBTC.address]),
          ).to.be.revertedWith('104');
          await expect(
            angleRouter.connect(governor).setLiquidityGauges([agEUR.address], [], [gaugeSanEURWBTC.address]),
          ).to.be.revertedWith('104');
          await expect(
            angleRouter.connect(governor).setLiquidityGauges([agEUR.address], [wBTC.address], []),
          ).to.be.revertedWith('104');
        });
        it('add gauge - revert zero address - collateral ', async () => {
          await expect(
            angleRouter
              .connect(governor)
              .setLiquidityGauges([agEUR.address], [ethers.constants.AddressZero], [gaugeSanEURWBTC.address]),
          ).to.be.revertedWith('0');
        });
        it('add gauge - wrong gauge', async () => {
          await expect(
            angleRouter.connect(governor).setLiquidityGauges([agEUR.address], [wBTC.address], [gaugeSanEURDAI.address]),
          ).to.be.revertedWith('20');
        });
        it('add gauge - success', async () => {
          await angleRouter
            .connect(governor)
            .setLiquidityGauges([agEUR.address], [wBTC.address], [gaugeSanEURWBTC2.address]);
          const pairsContracts = await angleRouter.mapPoolManagers(stableMasterEUR.address, wBTC.address);
          expect(pairsContracts.gauge).to.be.equal(gaugeSanEURWBTC2.address);
          expect(await sanTokenWBTC.allowance(angleRouter.address, gaugeSanEURWBTC2.address)).to.be.equal(
            ethers.constants.MaxUint256,
          );
        });
        it('replace gauge - success', async () => {
          await angleRouter
            .connect(governor)
            .setLiquidityGauges([agEUR.address], [wBTC.address], [gaugeSanEURWBTC.address]);
          const pairsContracts = await angleRouter.mapPoolManagers(stableMasterEUR.address, wBTC.address);
          expect(pairsContracts.gauge).to.be.equal(gaugeSanEURWBTC.address);
          expect(await sanTokenWBTC.allowance(angleRouter.address, gaugeSanEURWBTC.address)).to.be.equal(
            ethers.constants.MaxUint256,
          );
          expect(await wBTC.allowance(angleRouter.address, gaugeSanEURWBTC2.address)).to.be.equal(BigNumber.from(0));
        });
        it('replace gauge - success', async () => {
          await angleRouter
            .connect(governor)
            .setLiquidityGauges([agEUR.address], [wBTC.address], [gaugeSanEURWBTC.address]);
          const pairsContracts = await angleRouter.mapPoolManagers(stableMasterEUR.address, wBTC.address);
          expect(pairsContracts.gauge).to.be.equal(gaugeSanEURWBTC.address);
          expect(await sanTokenWBTC.allowance(angleRouter.address, gaugeSanEURWBTC.address)).to.be.equal(
            ethers.constants.MaxUint256,
          );
          expect(await wBTC.allowance(angleRouter.address, gaugeSanEURWBTC2.address)).to.be.equal(BigNumber.from(0));
        });
      });
      describe('approve', () => {
        it('revert - governor ', async () => {
          await expect(
            angleRouter
              .connect(user)
              .changeAllowance(
                [wBTC.address, DAI.address],
                [governor.address, governor.address],
                [ethers.constants.MaxUint256, ethers.constants.MaxUint256],
              ),
          ).to.be.revertedWith(governorOrGuardianError);
        });
        it('revert - invalid arrays ', async () => {
          await expect(
            angleRouter
              .connect(governor)
              .changeAllowance(
                [wBTC.address],
                [governor.address, governor.address],
                [ethers.constants.MaxUint256, ethers.constants.MaxUint256],
              ),
          ).to.be.revertedWith('104');
        });
        it('success - from no approval to full approval ', async () => {
          await angleRouter
            .connect(governor)
            .changeAllowance(
              [wBTC.address, DAI.address],
              [governor.address, governor.address],
              [ethers.constants.MaxUint256, ethers.constants.MaxUint256],
            );
          expect(await wBTC.allowance(angleRouter.address, governor.address)).to.be.equal(ethers.constants.MaxUint256);
          expect(await DAI.allowance(angleRouter.address, governor.address)).to.be.equal(ethers.constants.MaxUint256);
        });
        it('success - remove approval ', async () => {
          await angleRouter
            .connect(governor)
            .changeAllowance(
              [wBTC.address, DAI.address],
              [governor.address, governor.address],
              [ethers.constants.Zero, ethers.constants.Zero],
            );
          expect(await wBTC.allowance(angleRouter.address, governor.address)).to.be.equal(ethers.constants.Zero);
          expect(await DAI.allowance(angleRouter.address, governor.address)).to.be.equal(ethers.constants.Zero);
        });
        it('success - partial approval ', async () => {
          const partialAmount = ethers.constants.MaxUint256.div(BASE_18);
          await angleRouter
            .connect(governor)
            .changeAllowance(
              [wBTC.address, DAI.address],
              [governor.address, governor.address],
              [partialAmount, partialAmount],
            );
          expect(await wBTC.allowance(angleRouter.address, governor.address)).to.be.equal(partialAmount);
          expect(await DAI.allowance(angleRouter.address, governor.address)).to.be.equal(partialAmount);
        });
        it('success - same allowance ', async () => {
          const partialAmount = ethers.constants.MaxUint256.div(BASE_18);
          await angleRouter
            .connect(governor)
            .changeAllowance(
              [wBTC.address, DAI.address],
              [governor.address, governor.address],
              [partialAmount, partialAmount],
            );
          expect(await wBTC.allowance(angleRouter.address, governor.address)).to.be.equal(partialAmount);
          expect(await DAI.allowance(angleRouter.address, governor.address)).to.be.equal(partialAmount);
        });
        it('success - from partial approval to full approval ', async () => {
          await angleRouter
            .connect(governor)
            .changeAllowance(
              [wBTC.address, DAI.address],
              [governor.address, governor.address],
              [ethers.constants.MaxUint256, ethers.constants.MaxUint256],
            );
          expect(await wBTC.allowance(angleRouter.address, governor.address)).to.be.equal(ethers.constants.MaxUint256);
          expect(await DAI.allowance(angleRouter.address, governor.address)).to.be.equal(ethers.constants.MaxUint256);
        });
      });
      describe('Recover ERC20', () => {
        it('revert - onlyGovernorOrGuardian', async () => {
          expect(await DAI.balanceOf(governor.address)).to.be.equal(BigNumber.from(0));
          const amountLost = UNIT_DAI;
          await DAI.connect(governor).mint(angleRouter.address, amountLost);
          await expect(
            angleRouter.connect(user).recoverERC20(DAI.address, governor.address, amountLost),
          ).to.be.revertedWith('115');
          // set back to no funds
          await angleRouter.connect(governor).recoverERC20(DAI.address, governor.address, amountLost);
          await DAI.connect(governor).burn(governor.address, amountLost);
        });
        it('success', async () => {
          expect(await DAI.balanceOf(governor.address)).to.be.equal(BigNumber.from(0));
          const amountLost = UNIT_DAI;
          await DAI.mint(angleRouter.address, amountLost);
          await angleRouter.connect(governor).recoverERC20(DAI.address, governor.address, amountLost);
          expect(await DAI.balanceOf(governor.address)).to.be.equal(amountLost);
          await DAI.connect(governor).burn(governor.address, amountLost);
        });
      });
      describe('Change allowances', () => {
        it('success', async () => {
          angleRouter
            .connect(governor)
            .changeAllowance(
              [wETH.address, wETH.address],
              [uniswapRouter.address, oneInchRouter.address],
              [ethers.constants.MaxUint256, ethers.constants.MaxUint256],
            );
        });
      });
    });
  });
});
