import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, Signer, utils, BytesLike } from 'ethers';
import { formatBytes32String, parseEther, parseUnits } from 'ethers/lib/utils';
import hre, { contract, ethers, web3 } from 'hardhat';

import {
  MockOracle,
  MockOracle__factory,
  MockToken,
  MockToken__factory,
  MockAgToken,
  MockAgToken__factory,
  AngleRouter,
  AngleRouter__factory,
  MockVaultManagerPermit,
  MockVaultManagerPermit__factory,
  MockTokenPermit,
} from '../../typechain';
import { expect } from '../../utils/chai-setup';
import { inIndirectReceipt, inReceipt } from '../../utils/expectEvent';
import { deployUpgradeable, latestTime, ZERO_ADDRESS } from '../utils/helpers';
import { signPermitNFT, domainSeparator } from '../../utils/sigUtilsNFT';
import {
  addCollateral,
  borrow,
  closeVault,
  createVault,
  encodeAngleBorrow,
  repayDebt,
  removeCollateral,
  permit,
  getDebtIn,
} from '../../utils/helpersEncoding';
import { ActionType, TypeTransfer, TypeSwap, SwapType, BASE_PARAMS, initToken, TypePermit } from '../../utils/helpers';
import { signPermit } from '../../utils/sign';

contract('Router - VaultManager New functionalities', () => {
  const log = true;

  let deployer: SignerWithAddress;
  let USDC: MockTokenPermit;
  let agEUR: MockAgToken;
  let governor: SignerWithAddress;
  let guardian: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let collateral: MockToken;
  let oracle: MockOracle;
  let name: string;
  let router: AngleRouter;
  let vaultManager: MockVaultManagerPermit;
  let UNIT_ETH: BigNumber;
  let UNIT_USDC: BigNumber;
  let UNIT_WBTC: BigNumber;
  let UNIT_DAI: BigNumber;
  let ETHdecimal: BigNumber;
  let USDCdecimal: BigNumber;
  let wBTCdecimal: BigNumber;
  let DAIdecimal: BigNumber;

  const impersonatedSigners: { [key: string]: Signer } = {};

  before(async () => {
    ({ deployer, alice, bob, governor, guardian } = await ethers.getNamedSigners());
    // add any addresses you want to impersonate here
    const impersonatedAddresses = [{ address: '0xdC4e6DFe07EFCa50a197DF15D9200883eF4Eb1c8', name: 'governor' }];

    for (const ob of impersonatedAddresses) {
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ob.address],
      });

      await hre.network.provider.send('hardhat_setBalance', [ob.address, '0x10000000000000000000000000000']);

      impersonatedSigners[ob.name] = await ethers.getSigner(ob.address);
      ETHdecimal = BigNumber.from('18');
      USDCdecimal = BigNumber.from('6');
      wBTCdecimal = BigNumber.from('8');
      DAIdecimal = BigNumber.from('18');

      UNIT_ETH = BigNumber.from(10).pow(ETHdecimal);
      UNIT_USDC = BigNumber.from(10).pow(USDCdecimal);
      UNIT_WBTC = BigNumber.from(10).pow(wBTCdecimal);
      UNIT_DAI = BigNumber.from(10).pow(DAIdecimal);
    }
  });

  beforeEach(async () => {
    // If the forked-network state needs to be reset between each test, run this
    // await network.provider.request({method: 'hardhat_reset', params: []});
    router = (await deployUpgradeable(new AngleRouter__factory(deployer))) as AngleRouter;
    vaultManager = (await new MockVaultManagerPermit__factory(deployer).deploy('testVM')) as MockVaultManagerPermit;
    ({ token: USDC } = await initToken('USDC', USDCdecimal, governor));
    agEUR = (await deployUpgradeable(new MockAgToken__factory(deployer))) as MockAgToken;
    await agEUR.initialize('agEUR', 'agEUR', ZERO_ADDRESS, ZERO_ADDRESS);

    vaultManager
      .connect(alice)
      .setParams(
        alice.address,
        USDC.address,
        agEUR.address,
        BigNumber.from(1),
        BigNumber.from(1),
        BigNumber.from(1),
        BigNumber.from(1),
      );
    await agEUR.addMinter(vaultManager.address);
  });
  /*
  describe('mixer - parseVaultIDs', () => {
    it('success - addCollateral - to 1 vault', async () => {
      await vaultManager.connect(alice).setPaymentData(ethers.constants.Zero, 0, 0, UNIT_USDC);
      await (await USDC.connect(governor).mint(alice.address, UNIT_USDC)).wait();
      const permits: TypePermit[] = [
        await signPermit(
          alice,
          (await USDC.nonces(alice.address)).toNumber(),
          USDC.address,
          Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
          router.address,
          UNIT_DAI,
          'USDC',
        ),
      ];
      // const transfers: TypeTransfer[] = [];
      const transfers: TypeTransfer[] = [{ inToken: USDC.address, amountIn: UNIT_USDC }];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [createVault(alice.address), addCollateral(1, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];

      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await USDC.balanceOf(vaultManager.address)).to.be.equal(UNIT_USDC);
    });
    it('success - addCollateral - to multiple vaults 1/2 - vaultID = 0 and createVault action', async () => {
      await vaultManager.connect(alice).setPaymentData(ethers.constants.Zero, 0, 0, UNIT_USDC.mul(2));
      await (await USDC.connect(governor).mint(alice.address, UNIT_USDC.mul(2))).wait();
      const permits: TypePermit[] = [
        await signPermit(
          alice,
          (await USDC.nonces(alice.address)).toNumber(),
          USDC.address,
          Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
          router.address,
          UNIT_DAI,
          'USDC',
        ),
      ];
      // const transfers: TypeTransfer[] = [];
      const transfers: TypeTransfer[] = [{ inToken: USDC.address, amountIn: UNIT_USDC.mul(2) }];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [
        createVault(alice.address),
        addCollateral(1, UNIT_USDC),
        createVault(alice.address),
        addCollateral(0, UNIT_USDC),
      ];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];

      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await USDC.balanceOf(vaultManager.address)).to.be.equal(UNIT_USDC.mul(2));
    });
    it('success - addCollateral - to multiple vaults 2/2 - vaultID = 0 and no createVault action', async () => {
      await vaultManager.connect(alice).setPaymentData(ethers.constants.Zero, 0, 0, UNIT_USDC.mul(2));
      await vaultManager.updateVaultIDCount(10);
      await (await USDC.connect(governor).mint(alice.address, UNIT_USDC.mul(2))).wait();
      const permits: TypePermit[] = [
        await signPermit(
          alice,
          (await USDC.nonces(alice.address)).toNumber(),
          USDC.address,
          Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
          router.address,
          UNIT_DAI,
          'USDC',
        ),
      ];
      // const transfers: TypeTransfer[] = [];
      const transfers: TypeTransfer[] = [{ inToken: USDC.address, amountIn: UNIT_USDC.mul(2) }];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [addCollateral(0, UNIT_USDC), addCollateral(0, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];

      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await USDC.balanceOf(vaultManager.address)).to.be.equal(UNIT_USDC.mul(2));
    });
    it('reverts - closeVault - not approved', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      const permits: TypePermit[] = [];
      // const transfers: TypeTransfer[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [closeVault(1)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await expect(router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer)).to.be.revertedWith(
        'NotApprovedOrOwner',
      );
    });
    it('success - closeVault - vault approved', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      const permits: TypePermit[] = [];
      // const transfers: TypeTransfer[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [closeVault(1)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await vaultManager.approveSpenderVault(alice.address, 1, true);
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
    });
    it('success - closeVault - ID is zero and no createVault action', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      const permits: TypePermit[] = [];
      // const transfers: TypeTransfer[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [closeVault(0)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
    });
    it('success - closeVault - ID is zero and createVault action before', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [createVault(alice.address), closeVault(0)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
    });
    it('success - closeVault - ID is zero and createVault action after', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      const permits: TypePermit[] = [];
      // const transfers: TypeTransfer[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [closeVault(0), createVault(alice.address)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
    });
    it('reverts - closeVault - with just one missing vault', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      await vaultManager.approveSpenderVault(alice.address, 3, true);
      await vaultManager.approveSpenderVault(alice.address, 2, true);
      const permits: TypePermit[] = [];
      // const transfers: TypeTransfer[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [
        closeVault(0),
        closeVault(0),
        closeVault(10),
        closeVault(10),
        closeVault(10),
        closeVault(3),
        closeVault(4),
        closeVault(2),
      ];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await expect(router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer)).to.be.revertedWith(
        'NotApprovedOrOwner',
      );
    });
    it('success - closeVault - multiple zero and multiple times the same vault', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      const permits: TypePermit[] = [];
      // const transfers: TypeTransfer[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [closeVault(0), closeVault(0), closeVault(10), closeVault(10), closeVault(10)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
    });
    it('success - closeVault - multiple zero and different vaults', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      await vaultManager.approveSpenderVault(alice.address, 2, true);
      await vaultManager.approveSpenderVault(alice.address, 3, true);
      await vaultManager.approveSpenderVault(alice.address, 4, true);
      await vaultManager.approveSpenderVault(alice.address, 5, true);
      const permits: TypePermit[] = [];
      // const transfers: TypeTransfer[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [
        closeVault(0),
        closeVault(0),
        createVault(alice.address),
        closeVault(0),
        createVault(alice.address),
        closeVault(0),
        closeVault(2),
        closeVault(3),
      ];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
    });
    it('reverts - closeVault - too many actions', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      await vaultManager.approveSpenderVault(alice.address, 2, true);
      await vaultManager.approveSpenderVault(alice.address, 3, true);
      await vaultManager.approveSpenderVault(alice.address, 4, true);
      await vaultManager.approveSpenderVault(alice.address, 5, true);
      const permits: TypePermit[] = [];
      // const transfers: TypeTransfer[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [
        closeVault(0),
        closeVault(0),
        createVault(alice.address),
        closeVault(0),
        createVault(alice.address),
        closeVault(0),
        closeVault(2),
        closeVault(3),
        closeVault(0),
        closeVault(0),
        closeVault(0),
        closeVault(0),
      ];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await expect(router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer)).to.be.revertedWith(
        'IncompatibleLengths',
      );
    });
    it('success - borrow', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [borrow(0, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
    });
    it('success - borrow - custom vaultID', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.approveSpenderVault(alice.address, 3, true);
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [borrow(3, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
    });
    it('reverts - borrow - not owner', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [borrow(0, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await expect(router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer)).to.be.revertedWith(
        'NotApprovedOrOwner',
      );
    });
    it('success - removeCollateral', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [removeCollateral(0, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
    });
    it('success - removeCollateral - custom vaultID', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.approveSpenderVault(alice.address, 3, true);
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [removeCollateral(3, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
    });
    it('reverts - removeCollateral - not owner', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [removeCollateral(0, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await expect(router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer)).to.be.revertedWith(
        'NotApprovedOrOwner',
      );
    });
    it('success - getDebtIn', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [getDebtIn(0, ZERO_ADDRESS, 1, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
    });
    it('success - getDebtIn - custom vaultID', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.approveSpenderVault(alice.address, 3, true);
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [getDebtIn(3, ZERO_ADDRESS, 1, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
    });
    it('reverts - getDebtIn - not owner', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [getDebtIn(0, ZERO_ADDRESS, 1, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await expect(router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer)).to.be.revertedWith(
        'NotApprovedOrOwner',
      );
    });
    it('success - repayDebt - on a custom vault with no approval', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);

      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [repayDebt(10, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
    });
    it('success - repayDebt - on a custom vault with a createVault before', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);

      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [createVault(alice.address), repayDebt(0, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
    });
    it('success - repayDebt - on a custom vault with a createVault after', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);

      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [repayDebt(0, UNIT_USDC), createVault(alice.address)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
    });
    it('success - permit - on a custom vault with no approval', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);

      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const permitVM: TypePermit = await signPermit(
        alice,
        (await agEUR.nonces(alice.address)).toNumber(),
        agEUR.address,
        Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
        router.address,
        UNIT_DAI,
        'agEUR',
      );
      const callsBorrow = [permit(permitVM)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
    });
    it('success - permit - on a custom vault with a createVault before', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);

      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const permitVM: TypePermit = await signPermit(
        alice,
        (await agEUR.nonces(alice.address)).toNumber(),
        agEUR.address,
        Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
        router.address,
        UNIT_DAI,
        'agEUR',
      );
      const callsBorrow = [createVault(alice.address), permit(permitVM)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
    });
    it('success - permit - on a custom vault with a createVault after', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);

      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const permitVM: TypePermit = await signPermit(
        alice,
        (await agEUR.nonces(alice.address)).toNumber(),
        agEUR.address,
        Number(await (await web3.eth.getBlock('latest')).timestamp) + 1000,
        router.address,
        UNIT_DAI,
        'agEUR',
      );
      const callsBorrow = [permit(permitVM), createVault(alice.address)];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
    });
    it('success - composition of different actions in the vault with all approved vaults', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.approveSpenderVault(alice.address, 1, true);
      await vaultManager.approveSpenderVault(alice.address, 2, true);
      await vaultManager.approveSpenderVault(alice.address, 3, true);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [
        repayDebt(0, UNIT_USDC),
        addCollateral(10, 0),
        borrow(1, 0),
        removeCollateral(2, 0),
        getDebtIn(3, ZERO_ADDRESS, 0, 0),
        closeVault(0),
        closeVault(0),
        createVault(alice.address),
        repayDebt(9, UNIT_USDC),
      ];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer);
    });
    it('reverts - when one approval for one vault lacks', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.approveSpenderVault(alice.address, 1, true);
      await vaultManager.approveSpenderVault(alice.address, 2, true);
      // await vaultManager.approveSpenderVault(alice.address, 3, true);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const callsBorrow = [
        repayDebt(0, UNIT_USDC),
        addCollateral(10, 0),
        borrow(1, 0),
        removeCollateral(2, 0),
        getDebtIn(3, ZERO_ADDRESS, 0, 0),
        closeVault(0),
        closeVault(0),
        createVault(alice.address),
        repayDebt(9, UNIT_USDC),
      ];
      const dataBorrow = await encodeAngleBorrow(
        USDC.address,
        agEUR.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await expect(router.connect(alice).mixer(permits, transfers, swaps, actions, dataMixer)).to.be.revertedWith(
        'NotApprovedOrOwner',
      );
    });
  });
  */
  describe('mixerVaultManagerPermit', () => {
    it('success - permit signed on vaultManager', async () => {
      const name = 'testVM';
      const permitData = await signPermitNFT(
        bob,
        0,
        vaultManager.address,
        (await latestTime()) + 1000,
        router.address,
        true,
        name,
      );
      const permitParam = {
        vaultManager: permitData.contract,
        owner: permitData.owner,
        approved: permitData.approved,
        deadline: permitData.deadline,
        v: permitData.v,
        r: permitData.r,
        s: permitData.s,
      };
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const actions: ActionType[] = [];
      const dataMixer: BytesLike[] = [];
      await router.mixerVaultManagerPermit([permitParam], permits, transfers, swaps, actions, dataMixer);
      expect(await vaultManager.operatorApprovals(bob.address, router.address)).to.be.equal(1);
    });
    it('success - permit signed on vaultManager - just revoke', async () => {
      const name = 'testVM';
      const permitData = await signPermitNFT(
        bob,
        0,
        vaultManager.address,
        (await latestTime()) + 1000,
        router.address,
        false,
        name,
      );
      const permitParam = {
        vaultManager: permitData.contract,
        owner: permitData.owner,
        approved: permitData.approved,
        deadline: permitData.deadline,
        v: permitData.v,
        r: permitData.r,
        s: permitData.s,
      };
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const actions: ActionType[] = [];
      const dataMixer: BytesLike[] = [];
      await router.mixerVaultManagerPermit([permitParam], permits, transfers, swaps, actions, dataMixer);
      expect(await vaultManager.operatorApprovals(bob.address, router.address)).to.be.equal(0);
    });
    it('reverts - invalid signature', async () => {
      const name = 'testVM';
      const permitData = await signPermitNFT(
        bob,
        1,
        vaultManager.address,
        (await latestTime()) + 1000,
        router.address,
        true,
        name,
      );
      const permitParam = {
        vaultManager: permitData.contract,
        owner: permitData.owner,
        approved: permitData.approved,
        deadline: permitData.deadline,
        v: permitData.v,
        r: permitData.r,
        s: permitData.s,
      };
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const actions: ActionType[] = [];
      const dataMixer: BytesLike[] = [];
      await expect(
        router.mixerVaultManagerPermit([permitParam], permits, transfers, swaps, actions, dataMixer),
      ).to.be.revertedWith('InvalidSignature');
    });
    it('success - permit signed on vaultManager - granted and then revoked', async () => {
      const name = 'testVM';
      const permitData = await signPermitNFT(
        bob,
        0,
        vaultManager.address,
        (await latestTime()) + 1000,
        router.address,
        true,
        name,
      );
      const permitData2 = await signPermitNFT(
        bob,
        1,
        vaultManager.address,
        (await latestTime()) + 1000,
        router.address,
        false,
        name,
      );
      const permitParam = {
        vaultManager: permitData.contract,
        owner: permitData.owner,
        approved: permitData.approved,
        deadline: permitData.deadline,
        v: permitData.v,
        r: permitData.r,
        s: permitData.s,
      };
      const permitParam2 = {
        vaultManager: permitData2.contract,
        owner: permitData2.owner,
        approved: permitData2.approved,
        deadline: permitData2.deadline,
        v: permitData2.v,
        r: permitData2.r,
        s: permitData2.s,
      };
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const actions: ActionType[] = [];
      const dataMixer: BytesLike[] = [];
      await router.mixerVaultManagerPermit([permitParam, permitParam2], permits, transfers, swaps, actions, dataMixer);
      expect(await vaultManager.operatorApprovals(bob.address, router.address)).to.be.equal(0);
    });
    it('success - permit signed on vaultManager - first granted then two revoked', async () => {
      const name = 'testVM';
      const permitData = await signPermitNFT(
        bob,
        0,
        vaultManager.address,
        (await latestTime()) + 1000,
        router.address,
        true,
        name,
      );
      const permitData2 = await signPermitNFT(
        bob,
        1,
        vaultManager.address,
        (await latestTime()) + 1000,
        router.address,
        false,
        name,
      );
      const permitParam = {
        vaultManager: permitData.contract,
        owner: permitData.owner,
        approved: permitData.approved,
        deadline: permitData.deadline,
        v: permitData.v,
        r: permitData.r,
        s: permitData.s,
      };
      const permitParam2 = {
        vaultManager: permitData2.contract,
        owner: permitData2.owner,
        approved: permitData2.approved,
        deadline: permitData2.deadline,
        v: permitData2.v,
        r: permitData2.r,
        s: permitData2.s,
      };
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const actions: ActionType[] = [];
      const dataMixer: BytesLike[] = [];
      await router.mixerVaultManagerPermit([permitParam], permits, transfers, swaps, actions, dataMixer);
      expect(await vaultManager.operatorApprovals(bob.address, router.address)).to.be.equal(1);
      await router.mixerVaultManagerPermit([permitParam2], permits, transfers, swaps, actions, dataMixer);
      expect(await vaultManager.operatorApprovals(bob.address, router.address)).to.be.equal(0);
    });
    it('reverts - invalid signature on revoke', async () => {
      const name = 'testVM';
      const permitData = await signPermitNFT(
        bob,
        0,
        vaultManager.address,
        (await latestTime()) + 1000,
        router.address,
        true,
        name,
      );
      const permitData2 = await signPermitNFT(
        bob,
        0,
        vaultManager.address,
        (await latestTime()) + 1000,
        router.address,
        false,
        name,
      );
      const permitParam = {
        vaultManager: permitData.contract,
        owner: permitData.owner,
        approved: permitData.approved,
        deadline: permitData.deadline,
        v: permitData.v,
        r: permitData.r,
        s: permitData.s,
      };
      const permitParam2 = {
        vaultManager: permitData2.contract,
        owner: permitData2.owner,
        approved: permitData2.approved,
        deadline: permitData2.deadline,
        v: permitData2.v,
        r: permitData2.r,
        s: permitData2.s,
      };
      const permits: TypePermit[] = [];
      const transfers: TypeTransfer[] = [];
      const swaps: TypeSwap[] = [];
      const actions: ActionType[] = [];
      const dataMixer: BytesLike[] = [];
      await expect(
        router.mixerVaultManagerPermit([permitParam, permitParam2], permits, transfers, swaps, actions, dataMixer),
      ).to.be.revertedWith('InvalidSignature');
    });
  });
});
