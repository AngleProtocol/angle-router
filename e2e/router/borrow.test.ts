import { ChainId, CONTRACTS_ADDRESSES } from '@angleprotocol/sdk';
// we import our utilities
import { JsonRpcSigner } from '@ethersproject/providers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber } from 'ethers';
import { deployments, ethers, network, web3 } from 'hardhat';
import yargs from 'yargs';

import {
  AngleRouter,
  AngleRouter__factory,
  ERC20,
  IStETH__factory,
  IWStETH__factory,
  MockAgToken,
  MockAgToken__factory,
  MockANGLE,
  MockTokenPermit,
  MockVaultManager,
  MockVaultManager__factory,
} from '../../typechain';
import { AgToken, AgToken__factory } from '../../typechain/core';
import { expect } from '../../utils/chai-setup';
import { ActionType, BASE_PARAMS, initToken, SwapType, TypePermit, TypeSwap, TypeTransfer } from '../../utils/helpers';
import { addCollateral, borrow, createVault, encodeAngleBorrow } from '../../utils/helpersEncoding';
import { signPermit } from '../../utils/sign';

const argv = yargs.env('').boolean('ci').parseSync();

let ANGLE: MockANGLE;
let agEUR: MockAgToken;

let angleRouter: AngleRouter;

let USDC: MockTokenPermit;
let wETH: ERC20;
let WSTETHAddress: string;
let STETH: string;

let deployer: SignerWithAddress;
let guardianSigner: SignerWithAddress;
let richUSDCUser: SignerWithAddress;
let agEURHolderSigner: SignerWithAddress;
let user: SignerWithAddress;
let user2: SignerWithAddress;
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
describe('AngleRouter - borrower', () => {
  beforeEach(async () => {
    ({ deployer, governor, user, alice: cleanAddress, bob: treasury, user2 } = await ethers.getNamedSigners());

    const guardian = CONTRACTS_ADDRESSES[ChainId.MAINNET].Guardian! as string;
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [guardian],
    });
    guardianSigner = await ethers.getSigner(guardian);

    const agEURHolder = '0xB0b0F6F13A5158eB67724282F586a552E75b5728';
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [agEURHolder],
    });
    agEURHolderSigner = await ethers.getSigner(agEURHolder);

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
    agEUR = new ethers.Contract(agEURAddress, MockAgToken__factory.createInterface(), deployer) as MockAgToken;
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

    await (await agEUR.connect(guardianSigner).addMinter(vaultManagerA.address)).wait();
    await (await agEUR.connect(guardianSigner).addMinter(vaultManagerB.address)).wait();

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
        dataMixer;
        actions;
      });
    });
    describe('VaultManager', () => {
      it('angle - revert - 1st state', async () => {
        await await vaultManagerA
          .connect(user)
          .setPaymentData(ethers.constants.Zero, UNIT_DAI, UNIT_USDC, ethers.constants.Zero);

        await (await USDC.connect(governor).mint(vaultManagerA.address, UNIT_USDC)).wait();
        await (await agEUR.connect(governor).mint(user.address, UNIT_DAI)).wait();

        const permits: TypePermit[] = [];
        const transfers: TypeTransfer[] = [];
        const swaps: TypeSwap[] = [];
        const callsBorrow = [createVault(user.address), addCollateral(1, UNIT_DAI)];
        const dataBorrow = await encodeAngleBorrow(
          USDC.address,
          agEUR.address,
          vaultManagerA.address,
          cleanAddress.address,
          treasury.address,
          '0x',
          callsBorrow,
        );

        const actions = [ActionType.borrower];
        const dataMixer = [dataBorrow];

        await expect(
          angleRouter.connect(user2).mixer(permits, transfers, swaps, actions, dataMixer),
        ).to.be.revertedWith('23');
      });
      it('angle - success - 1st state', async () => {
        await await vaultManagerA
          .connect(user)
          .setPaymentData(ethers.constants.Zero, UNIT_DAI, UNIT_USDC, ethers.constants.Zero);

        const balanceBefore = await agEUR.balanceOf(user.address);

        await (await USDC.connect(governor).mint(vaultManagerA.address, UNIT_USDC)).wait();
        await (await agEUR.connect(governor).mint(user.address, UNIT_DAI)).wait();

        const permits: TypePermit[] = [
          await signPermit(
            user,
            (await agEUR.nonces(user.address)).toNumber(),
            agEUR.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
            angleRouter.address,
            UNIT_DAI,
            'agEUR',
          ),
        ];
        const transfers: TypeTransfer[] = [];
        // const transfers: TypeTransfer[] = [{ inToken: USDC.address, amountIn: UNIT_USDC }];
        const swaps: TypeSwap[] = [];
        const callsBorrow = [createVault(user.address), addCollateral(1, UNIT_DAI)];
        const dataBorrow = await encodeAngleBorrow(
          USDC.address,
          agEUR.address,
          vaultManagerA.address,
          cleanAddress.address,
          treasury.address,
          '0x',
          callsBorrow,
        );

        const actions = [ActionType.borrower];
        const dataMixer = [dataBorrow];

        await angleRouter.connect(user).mixer(permits, transfers, swaps, actions, dataMixer);
        expect(await USDC.balanceOf(cleanAddress.address)).to.be.equal(UNIT_USDC);
        expect(await agEUR.balanceOf(user.address)).to.be.equal(balanceBefore);
        await await USDC.connect(cleanAddress).burn(cleanAddress.address, UNIT_USDC);
      });
      it('angle - success - 1st state - send back to router', async () => {
        await await vaultManagerA
          .connect(user)
          .setPaymentData(ethers.constants.Zero, UNIT_DAI, UNIT_USDC, ethers.constants.Zero);

        const balanceBefore = await agEUR.balanceOf(user.address);
        const balanceUSDCBefore = await USDC.balanceOf(user.address);

        await (await USDC.connect(governor).mint(vaultManagerA.address, UNIT_USDC)).wait();
        await (await agEUR.connect(governor).mint(user.address, UNIT_DAI)).wait();

        const permits: TypePermit[] = [
          await signPermit(
            user,
            (await agEUR.nonces(user.address)).toNumber(),
            agEUR.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
            angleRouter.address,
            UNIT_DAI,
            'agEUR',
          ),
        ];
        const transfers: TypeTransfer[] = [];
        // const transfers: TypeTransfer[] = [{ inToken: USDC.address, amountIn: UNIT_USDC }];
        const swaps: TypeSwap[] = [];
        const callsBorrow = [createVault(user.address), addCollateral(1, UNIT_DAI)];
        const dataBorrow = await encodeAngleBorrow(
          USDC.address,
          agEUR.address,
          vaultManagerA.address,
          angleRouter.address,
          treasury.address,
          '0x',
          callsBorrow,
        );

        const actions = [ActionType.borrower];
        const dataMixer = [dataBorrow];

        await angleRouter.connect(user).mixer(permits, transfers, swaps, actions, dataMixer);
        expect(await USDC.balanceOf(user.address)).to.be.equal(balanceUSDCBefore.add(UNIT_USDC));
        expect(await agEUR.balanceOf(user.address)).to.be.equal(balanceBefore);
        await await USDC.connect(user).burn(user.address, UNIT_USDC);
      });
      it('angle - success - 2nd state', async () => {
        await await vaultManagerA
          .connect(user)
          .setPaymentData(ethers.constants.Zero, UNIT_DAI, ethers.constants.Zero, UNIT_USDC);

        const balanceBefore = await agEUR.balanceOf(user.address);
        const balanceUSDCBefore = await USDC.balanceOf(user.address);

        await (await agEUR.connect(governor).mint(user.address, UNIT_DAI)).wait();
        await (await USDC.connect(governor).mint(user.address, UNIT_USDC)).wait();

        const permits: TypePermit[] = [
          await signPermit(
            user,
            (await agEUR.nonces(user.address)).toNumber(),
            agEUR.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
            angleRouter.address,
            UNIT_DAI,
            'agEUR',
          ),
          await signPermit(
            user,
            (await USDC.nonces(user.address)).toNumber(),
            USDC.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
            angleRouter.address,
            UNIT_USDC,
            'USDC',
          ),
        ];
        const transfers: TypeTransfer[] = [
          { inToken: USDC.address, receiver: angleRouter.address, amountIn: UNIT_USDC },
        ];
        const swaps: TypeSwap[] = [];
        const callsBorrow = [createVault(user.address), addCollateral(1, UNIT_DAI)];
        const dataBorrow = await encodeAngleBorrow(
          USDC.address,
          agEUR.address,
          vaultManagerA.address,
          cleanAddress.address,
          treasury.address,
          '0x',
          callsBorrow,
        );

        const actions = [ActionType.borrower];
        const dataMixer = [dataBorrow];

        await angleRouter.connect(user).mixer(permits, transfers, swaps, actions, dataMixer);
        expect(await USDC.balanceOf(user.address)).to.be.equal(balanceUSDCBefore);
        expect(await agEUR.balanceOf(user.address)).to.be.equal(balanceBefore);
      });
      it('angle - success - 3rd state', async () => {
        await await vaultManagerA
          .connect(user)
          .setPaymentData(UNIT_DAI, ethers.constants.Zero, UNIT_USDC, ethers.constants.Zero);

        const balanceBefore = await agEUR.balanceOf(cleanAddress.address);
        const balanceUSDCBefore = await USDC.balanceOf(cleanAddress.address);

        await (await USDC.connect(governor).mint(vaultManagerA.address, UNIT_USDC)).wait();
        await (await agEUR.connect(governor).mint(vaultManagerA.address, UNIT_DAI)).wait();

        const permits: TypePermit[] = [];
        const transfers: TypeTransfer[] = [];
        const swaps: TypeSwap[] = [];
        const callsBorrow = [createVault(user.address), addCollateral(1, UNIT_DAI)];
        const dataBorrow = await encodeAngleBorrow(
          USDC.address,
          agEUR.address,
          vaultManagerA.address,
          cleanAddress.address,
          treasury.address,
          '0x',
          callsBorrow,
        );

        const actions = [ActionType.borrower];
        const dataMixer = [dataBorrow];

        await angleRouter.connect(user).mixer(permits, transfers, swaps, actions, dataMixer);
        expect(await USDC.balanceOf(cleanAddress.address)).to.be.equal(balanceUSDCBefore.add(UNIT_USDC));
        expect(await agEUR.balanceOf(cleanAddress.address)).to.be.equal(balanceBefore.add(UNIT_DAI));
      });
      it('angle - revert - 3rd state - wrong stablecoin', async () => {
        await await vaultManagerA
          .connect(user)
          .setPaymentData(UNIT_DAI, ethers.constants.Zero, UNIT_USDC, ethers.constants.Zero);

        await (await USDC.connect(governor).mint(vaultManagerA.address, UNIT_USDC)).wait();
        await (await agEUR.connect(governor).mint(vaultManagerA.address, UNIT_DAI)).wait();

        const permits: TypePermit[] = [];
        const transfers: TypeTransfer[] = [];
        const swaps: TypeSwap[] = [];
        const callsBorrow = [createVault(user.address), addCollateral(1, UNIT_DAI)];
        const dataBorrow = await encodeAngleBorrow(
          USDC.address,
          WSTETHAddress,
          vaultManagerA.address,
          angleRouter.address,
          treasury.address,
          '0x',
          callsBorrow,
        );

        const actions = [ActionType.borrower];
        const dataMixer = [dataBorrow];

        await expect(
          angleRouter.connect(user2).mixer(permits, transfers, swaps, actions, dataMixer),
        ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
      });
      it('angle - success - 3rd state - send back to router', async () => {
        await await vaultManagerA
          .connect(user)
          .setPaymentData(UNIT_DAI, ethers.constants.Zero, UNIT_USDC, ethers.constants.Zero);

        const balanceBefore = await agEUR.balanceOf(user.address);
        const balanceUSDCBefore = await USDC.balanceOf(user.address);

        await (await USDC.connect(governor).mint(vaultManagerA.address, UNIT_USDC)).wait();
        await (await agEUR.connect(governor).mint(vaultManagerA.address, UNIT_DAI)).wait();

        const permits: TypePermit[] = [];
        const transfers: TypeTransfer[] = [];
        const swaps: TypeSwap[] = [];
        const callsBorrow = [createVault(user.address), addCollateral(1, UNIT_DAI)];
        const dataBorrow = await encodeAngleBorrow(
          USDC.address,
          agEUR.address,
          vaultManagerA.address,
          angleRouter.address,
          treasury.address,
          '0x',
          callsBorrow,
        );

        const actions = [ActionType.borrower];
        const dataMixer = [dataBorrow];

        await angleRouter.connect(user).mixer(permits, transfers, swaps, actions, dataMixer);
        expect(await USDC.balanceOf(user.address)).to.be.equal(balanceUSDCBefore.add(UNIT_USDC));
        expect(await agEUR.balanceOf(user.address)).to.be.equal(balanceBefore.add(UNIT_DAI));

        await await USDC.connect(cleanAddress).burn(user.address, UNIT_USDC);
        await await agEUR.connect(user).burnStablecoin(UNIT_USDC);
      });
      it('angle - success - 4th state - send back to router', async () => {
        await await vaultManagerA
          .connect(user)
          .setPaymentData(UNIT_DAI, ethers.constants.Zero, ethers.constants.Zero, UNIT_USDC);

        const balanceBefore = await agEUR.balanceOf(user.address);
        const balanceUSDCBefore = await USDC.balanceOf(user.address);

        await (await USDC.connect(governor).mint(user.address, UNIT_USDC)).wait();
        await (await agEUR.connect(governor).mint(vaultManagerA.address, UNIT_DAI)).wait();

        const permits: TypePermit[] = [
          await signPermit(
            user,
            (await USDC.nonces(user.address)).toNumber(),
            USDC.address,
            Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
            angleRouter.address,
            UNIT_USDC,
            'USDC',
          ),
        ];
        const transfers: TypeTransfer[] = [
          { inToken: USDC.address, receiver: angleRouter.address, amountIn: UNIT_USDC },
        ];
        const swaps: TypeSwap[] = [];
        const callsBorrow = [createVault(user.address), addCollateral(1, UNIT_DAI)];
        const dataBorrow = await encodeAngleBorrow(
          USDC.address,
          agEUR.address,
          vaultManagerA.address,
          angleRouter.address,
          treasury.address,
          '0x',
          callsBorrow,
        );

        const actions = [ActionType.borrower];
        const dataMixer = [dataBorrow];

        await angleRouter.connect(user).mixer(permits, transfers, swaps, actions, dataMixer);
        expect(await USDC.balanceOf(user.address)).to.be.equal(balanceUSDCBefore);
        expect(await agEUR.balanceOf(user.address)).to.be.equal(balanceBefore.add(UNIT_DAI));

        await await agEUR.connect(user).burnStablecoin(UNIT_USDC);
      });
    });
  });
});
