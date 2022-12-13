import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, BytesLike, Signer } from 'ethers';
import hre, { contract, ethers, web3 } from 'hardhat';

import {
  AngleRouterPolygon,
  AngleRouterPolygon__factory,
  MockAgToken,
  MockAgToken__factory,
  MockTokenPermit,
  MockVaultManager,
  MockVaultManager__factory,
  MockVaultManagerPermit,
  MockVaultManagerPermit__factory,
  MockVaultManagerPermitCollateral,
  MockVaultManagerPermitCollateral__factory,
} from '../../../typechain';
import { expect } from '../../../utils/chai-setup';
import { ActionType, initToken, TypePermit } from '../../../utils/helpers';
import {
  addCollateral,
  borrow,
  closeVault,
  createVault,
  encodeAngleBorrowSidechain,
  getDebtIn,
  permit,
  removeCollateral,
  repayDebt,
} from '../../../utils/helpersEncoding';
import { signPermit } from '../../../utils/sign';
import { signPermitNFT } from '../../../utils/sigUtilsNFT';
import { deployUpgradeable, latestTime, MAX_UINT256, ZERO_ADDRESS } from '../utils/helpers';

contract('BaseRouter - VaultManager functionalities', () => {
  // As a proxy for the AngleRouter sidechain we're using the Polygon implementation of it
  let deployer: SignerWithAddress;
  let USDC: MockTokenPermit;
  let agEUR: MockAgToken;
  let governor: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let router: AngleRouterPolygon;
  let vaultManager: MockVaultManagerPermit;
  let UNIT_USDC: BigNumber;
  let UNIT_DAI: BigNumber;
  let USDCdecimal: BigNumber;
  let DAIdecimal: BigNumber;

  const impersonatedSigners: { [key: string]: Signer } = {};

  before(async () => {
    ({ deployer, alice, bob, governor } = await ethers.getNamedSigners());
    // add any addresses you want to impersonate here
    const impersonatedAddresses = [{ address: '0xdC4e6DFe07EFCa50a197DF15D9200883eF4Eb1c8', name: 'governor' }];

    for (const ob of impersonatedAddresses) {
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [ob.address],
      });

      await hre.network.provider.send('hardhat_setBalance', [ob.address, '0x10000000000000000000000000000']);

      impersonatedSigners[ob.name] = await ethers.getSigner(ob.address);
      USDCdecimal = BigNumber.from('6');
      DAIdecimal = BigNumber.from('18');

      UNIT_USDC = BigNumber.from(10).pow(USDCdecimal);
      UNIT_DAI = BigNumber.from(10).pow(DAIdecimal);
    }
  });

  beforeEach(async () => {
    // If the forked-network state needs to be reset between each test, run this
    // await network.provider.request({method: 'hardhat_reset', params: []});
    router = (await deployUpgradeable(new AngleRouterPolygon__factory(deployer))) as AngleRouterPolygon;
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

      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC],
      );
      const callsBorrow = [createVault(alice.address), addCollateral(1, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.transfer, ActionType.borrower];
      const dataMixer = [transferData, dataBorrow];

      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await USDC.balanceOf(vaultManager.address)).to.be.equal(UNIT_USDC);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
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
      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC.mul(2)],
      );
      const callsBorrow = [
        createVault(alice.address),
        addCollateral(1, UNIT_USDC),
        createVault(alice.address),
        addCollateral(0, UNIT_USDC),
      ];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.transfer, ActionType.borrower];
      const dataMixer = [transferData, dataBorrow];

      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await USDC.balanceOf(vaultManager.address)).to.be.equal(UNIT_USDC.mul(2));
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
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

      const callsBorrow = [addCollateral(0, UNIT_USDC), addCollateral(0, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC.mul(2)],
      );
      const actions = [ActionType.transfer, ActionType.borrower];
      const dataMixer = [transferData, dataBorrow];

      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await USDC.balanceOf(vaultManager.address)).to.be.equal(UNIT_USDC.mul(2));
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('reverts - closeVault - not approved', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      const permits: TypePermit[] = [];
      const callsBorrow = [closeVault(1)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.revertedWith('NotApprovedOrOwner');
    });
    it('success - closeVault - vault approved', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      const permits: TypePermit[] = [];
      const callsBorrow = [closeVault(1)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await vaultManager.approveSpenderVault(alice.address, 1, true);
      await router.connect(alice).mixer(permits, actions, dataMixer);
      // Allowance is still given in this case
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('success - closeVault - ID is zero and no createVault action', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      const permits: TypePermit[] = [];
      const callsBorrow = [closeVault(0)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('success - closeVault - ID is zero and createVault action before', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      const permits: TypePermit[] = [];
      const callsBorrow = [createVault(alice.address), closeVault(0)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('success - closeVault - ID is zero and createVault action after', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      const permits: TypePermit[] = [];
      const callsBorrow = [closeVault(0), createVault(alice.address)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('reverts - closeVault - with just one missing vault', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      await vaultManager.approveSpenderVault(alice.address, 3, true);
      await vaultManager.approveSpenderVault(alice.address, 2, true);
      const permits: TypePermit[] = [];
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
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.revertedWith('NotApprovedOrOwner');
    });
    it('success - closeVault - multiple zero and multiple times the same vault', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      const permits: TypePermit[] = [];
      const callsBorrow = [closeVault(0), closeVault(0), closeVault(10), closeVault(10), closeVault(10)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
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
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('success - borrow', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      const permits: TypePermit[] = [];
      const callsBorrow = [borrow(0, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('success - borrow - custom vaultID', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.approveSpenderVault(alice.address, 3, true);
      const permits: TypePermit[] = [];
      const callsBorrow = [borrow(3, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('reverts - borrow - not owner', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      const permits: TypePermit[] = [];
      const callsBorrow = [borrow(0, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.revertedWith('NotApprovedOrOwner');
    });
    it('success - removeCollateral', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      const permits: TypePermit[] = [];
      const callsBorrow = [removeCollateral(0, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('success - removeCollateral - custom vaultID', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.approveSpenderVault(alice.address, 3, true);
      const permits: TypePermit[] = [];
      const callsBorrow = [removeCollateral(3, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('reverts - removeCollateral - not owner', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      const permits: TypePermit[] = [];
      const callsBorrow = [removeCollateral(0, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.revertedWith('NotApprovedOrOwner');
    });
    it('success - getDebtIn', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      const permits: TypePermit[] = [];
      const callsBorrow = [getDebtIn(0, ZERO_ADDRESS, 1, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('success - getDebtIn - custom vaultID', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.approveSpenderVault(alice.address, 3, true);
      const permits: TypePermit[] = [];
      const callsBorrow = [getDebtIn(3, ZERO_ADDRESS, 1, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('reverts - getDebtIn - not owner', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.updateVaultIDCount(10);
      const permits: TypePermit[] = [];
      const callsBorrow = [getDebtIn(0, ZERO_ADDRESS, 1, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.revertedWith('NotApprovedOrOwner');
    });
    it('success - repayDebt - on a custom vault with no approval', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);

      const permits: TypePermit[] = [];
      const callsBorrow = [repayDebt(10, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('success - repayDebt - on a custom vault with a createVault before', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);

      const permits: TypePermit[] = [];
      const callsBorrow = [createVault(alice.address), repayDebt(0, UNIT_USDC)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('success - repayDebt - on a custom vault with a createVault after', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);

      const permits: TypePermit[] = [];
      const callsBorrow = [repayDebt(0, UNIT_USDC), createVault(alice.address)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('success - permit - on a custom vault with no approval', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);

      const permits: TypePermit[] = [];
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
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('success - permit - on a custom vault with a createVault before', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);

      const permits: TypePermit[] = [];
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
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('success - permit - on a custom vault with a createVault after', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);

      const permits: TypePermit[] = [];
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
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('success - composition of different actions in the vault with all approved vaults', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.approveSpenderVault(alice.address, 1, true);
      await vaultManager.approveSpenderVault(alice.address, 2, true);
      await vaultManager.approveSpenderVault(alice.address, 3, true);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      const permits: TypePermit[] = [];
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
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('reverts - when one approval for one vault lacks', async () => {
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.approveSpenderVault(alice.address, 1, true);
      await vaultManager.approveSpenderVault(alice.address, 2, true);
      // await vaultManager.approveSpenderVault(alice.address, 3, true);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      const permits: TypePermit[] = [];
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
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await expect(router.connect(alice).mixer(permits, actions, dataMixer)).to.be.revertedWith('NotApprovedOrOwner');
    });
  });

  describe('mixerVaultManagerPermit - permit', () => {
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
      const actions: ActionType[] = [];
      const dataMixer: BytesLike[] = [];
      await router.mixerVaultManagerPermit([permitParam], permits, actions, dataMixer);
      expect(await vaultManager.operatorApprovals(bob.address, router.address)).to.be.equal(1);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(0);
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
      const actions: ActionType[] = [];
      const dataMixer: BytesLike[] = [];
      await router.mixerVaultManagerPermit([permitParam], permits, actions, dataMixer);
      expect(await vaultManager.operatorApprovals(bob.address, router.address)).to.be.equal(0);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(0);
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
      const actions: ActionType[] = [];
      const dataMixer: BytesLike[] = [];
      await expect(router.mixerVaultManagerPermit([permitParam], permits, actions, dataMixer)).to.be.revertedWith(
        'InvalidSignature',
      );
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
      const actions: ActionType[] = [];
      const dataMixer: BytesLike[] = [];
      await router.mixerVaultManagerPermit([permitParam, permitParam2], permits, actions, dataMixer);
      expect(await vaultManager.operatorApprovals(bob.address, router.address)).to.be.equal(0);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(0);
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
      const actions: ActionType[] = [];
      const dataMixer: BytesLike[] = [];
      await router.mixerVaultManagerPermit([permitParam], permits, actions, dataMixer);
      expect(await vaultManager.operatorApprovals(bob.address, router.address)).to.be.equal(1);
      await router.mixerVaultManagerPermit([permitParam2], permits, actions, dataMixer);
      expect(await vaultManager.operatorApprovals(bob.address, router.address)).to.be.equal(0);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(0);
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
      const actions: ActionType[] = [];
      const dataMixer: BytesLike[] = [];
      await expect(
        router.mixerVaultManagerPermit([permitParam, permitParam2], permits, actions, dataMixer),
      ).to.be.revertedWith('InvalidSignature');
    });
  });
  describe('mixerVaultManagerPermit - accounting management', () => {
    it('success - composition of different actions in the vault with all approved vaults', async () => {
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
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.approveSpenderVault(alice.address, 1, true);
      await vaultManager.approveSpenderVault(alice.address, 2, true);
      await vaultManager.approveSpenderVault(alice.address, 3, true);
      await vaultManager.updateVaultIDCount(10);
      await vaultManager.approveSpenderVault(alice.address, 10, true);
      const permits: TypePermit[] = [];
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
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixerVaultManagerPermit([permitParam], permits, actions, dataMixer);
      expect(await vaultManager.operatorApprovals(bob.address, router.address)).to.be.equal(1);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('success - with repayData.length > 0 and no transfers', async () => {
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
      // Balance does not change
      await (await USDC.connect(governor).mint(router.address, UNIT_USDC)).wait();
      await vaultManager.connect(alice).setPaymentData(0, 0, 0, 0);
      await vaultManager.approveSpenderVault(alice.address, 1, true);
      const permits: TypePermit[] = [];
      const callsBorrow = [createVault(alice.address)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixerVaultManagerPermit([permitParam], permits, actions, dataMixer);
      expect(await vaultManager.operatorApprovals(bob.address, router.address)).to.be.equal(1);
      expect(await USDC.balanceOf(router.address)).to.be.equal(UNIT_USDC);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });

    it('success - with repayData.length > 0 and collateral transfers to another address', async () => {
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
      // Balance does not change
      await (await USDC.connect(governor).mint(vaultManager.address, UNIT_USDC)).wait();
      await vaultManager.connect(alice).setPaymentData(0, 0, UNIT_USDC, 0);
      await vaultManager.approveSpenderVault(alice.address, 1, true);
      const permits: TypePermit[] = [];
      const callsBorrow = [createVault(alice.address)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0xe0136b3661826a483734248681e4f59ae66bc6065ceb43fdd469ecb22c21d745',
        callsBorrow,
      );

      const actions = [ActionType.borrower];
      const dataMixer = [dataBorrow];
      await router.connect(alice).mixerVaultManagerPermit([permitParam], permits, actions, dataMixer);
      // Nothing is transferred to the msg.sender
      expect(await USDC.balanceOf(bob.address)).to.be.equal(UNIT_USDC);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('success - with collateral payment and stablecoin payment + repayData', async () => {
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
      // Balance does not change
      await (await USDC.connect(governor).mint(alice.address, UNIT_USDC)).wait();
      await (await agEUR.connect(governor).mint(alice.address, UNIT_DAI)).wait();
      await agEUR.connect(alice).approve(router.address, UNIT_DAI);
      await USDC.connect(alice).approve(router.address, UNIT_USDC);
      await vaultManager.connect(alice).setPaymentData(0, UNIT_DAI, 0, UNIT_USDC);
      await vaultManager.approveSpenderVault(alice.address, 1, true);
      const permits: TypePermit[] = [];
      const callsBorrow = [createVault(alice.address)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        router.address,
        ZERO_ADDRESS,
        '0xe0136b3661826a483734248681e4f59ae66bc6065ceb43fdd469ecb22c21d745',
        callsBorrow,
      );
      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC],
      );
      const actions = [ActionType.transfer, ActionType.borrower];
      const dataMixer = [transferData, dataBorrow];
      await router.connect(alice).mixerVaultManagerPermit([permitParam], permits, actions, dataMixer);
      // Leftover transferred to the msg.sender
      expect(await USDC.balanceOf(vaultManager.address)).to.be.equal(UNIT_USDC);
      expect(await agEUR.balanceOf(alice.address)).to.be.equal(0);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('success - with collateral payment and stablecoin payment + no repayData -> effect should be the same', async () => {
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
      // Balance does not change
      await (await USDC.connect(governor).mint(alice.address, UNIT_USDC)).wait();
      await (await agEUR.connect(governor).mint(alice.address, UNIT_DAI)).wait();
      await agEUR.connect(alice).approve(router.address, UNIT_DAI);
      await USDC.connect(alice).approve(router.address, UNIT_USDC);
      await vaultManager.connect(alice).setPaymentData(0, UNIT_DAI, 0, UNIT_USDC);
      await vaultManager.approveSpenderVault(alice.address, 1, true);
      const permits: TypePermit[] = [];
      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC],
      );
      const callsBorrow = [createVault(alice.address)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        router.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );
      const actions = [ActionType.transfer, ActionType.borrower];
      const dataMixer = [transferData, dataBorrow];
      await router.connect(alice).mixerVaultManagerPermit([permitParam], permits, actions, dataMixer);
      // Leftover transferred to the msg.sender
      expect(await USDC.balanceOf(vaultManager.address)).to.be.equal(UNIT_USDC);
      expect(await agEUR.balanceOf(alice.address)).to.be.equal(0);
      expect(await vaultManager.operatorApprovals(bob.address, router.address)).to.be.equal(1);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('success - with collateral payment and stablecoin receipt + no repayData + to!= address(this) ', async () => {
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
      // Balance does not change
      await (await USDC.connect(governor).mint(alice.address, UNIT_USDC)).wait();
      await (await USDC.connect(governor).mint(vaultManager.address, UNIT_USDC)).wait();
      await (await agEUR.connect(governor).mint(alice.address, UNIT_DAI)).wait();
      await agEUR.connect(alice).approve(router.address, UNIT_DAI);
      await USDC.connect(alice).approve(router.address, UNIT_USDC);
      await vaultManager.connect(alice).setPaymentData(UNIT_DAI, 0, UNIT_USDC, 0);
      await vaultManager.approveSpenderVault(alice.address, 1, true);
      const permits: TypePermit[] = [];
      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC],
      );
      const callsBorrow = [createVault(alice.address)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );
      const actions = [ActionType.transfer, ActionType.borrower];
      const dataMixer = [transferData, dataBorrow];
      await router.connect(alice).mixerVaultManagerPermit([permitParam], permits, actions, dataMixer);
      // Leftover transferred to the msg.sender
      expect(await USDC.balanceOf(vaultManager.address)).to.be.equal(0);
      expect(await agEUR.balanceOf(bob.address)).to.be.equal(UNIT_DAI);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(UNIT_USDC);
      expect(await vaultManager.operatorApprovals(bob.address, router.address)).to.be.equal(1);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
    it('success - with collateral payment and stablecoin receipt + no repayData + to = address(this) ', async () => {
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
      // Balance does not change
      await (await USDC.connect(governor).mint(alice.address, UNIT_USDC)).wait();
      await (await USDC.connect(governor).mint(vaultManager.address, UNIT_USDC)).wait();
      await (await agEUR.connect(governor).mint(alice.address, UNIT_DAI)).wait();
      await agEUR.connect(alice).approve(router.address, UNIT_DAI);
      await USDC.connect(alice).approve(router.address, UNIT_USDC);
      await vaultManager.connect(alice).setPaymentData(UNIT_DAI, 0, UNIT_USDC, 0);
      await vaultManager.approveSpenderVault(alice.address, 1, true);
      const permits: TypePermit[] = [];
      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC],
      );
      const callsBorrow = [createVault(alice.address)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager.address,
        router.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );
      const actions = [ActionType.transfer, ActionType.borrower];
      const dataMixer = [transferData, dataBorrow];
      await router.connect(alice).mixerVaultManagerPermit([permitParam], permits, actions, dataMixer);
      // Leftover transferred to the msg.sender
      expect(await USDC.balanceOf(vaultManager.address)).to.be.equal(0);
      expect(await agEUR.balanceOf(alice.address)).to.be.equal(UNIT_DAI.mul(1));
      expect(await USDC.balanceOf(alice.address)).to.be.equal(UNIT_USDC.mul(0));
      expect(await vaultManager.operatorApprovals(bob.address, router.address)).to.be.equal(1);
      expect(await USDC.allowance(router.address, vaultManager.address)).to.be.equal(MAX_UINT256);
    });
  });
  describe('mixer - borrower with collateral amount max', () => {
    it('success - collateral added to 1 vault with max amount', async () => {
      const vaultManager2 = (await new MockVaultManagerPermitCollateral__factory(deployer).deploy(
        'testVM',
      )) as MockVaultManagerPermitCollateral;
      vaultManager2
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

      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC],
      );
      const callsBorrow = [createVault(alice.address), addCollateral(1, MAX_UINT256)];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager2.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );
      const actions = [ActionType.transfer, ActionType.borrower];
      const dataMixer = [transferData, dataBorrow];

      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await USDC.balanceOf(vaultManager2.address)).to.be.equal(UNIT_USDC);
      expect(await USDC.allowance(router.address, vaultManager2.address)).to.be.equal(MAX_UINT256);
      expect(await vaultManager2.collatData(1)).to.be.equal(UNIT_USDC);
    });
    it('success - collateral added to 1 vault with partial amount', async () => {
      const vaultManager2 = (await new MockVaultManagerPermitCollateral__factory(deployer).deploy(
        'testVM',
      )) as MockVaultManagerPermitCollateral;
      vaultManager2
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

      const transferData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [USDC.address, router.address, UNIT_USDC],
      );
      const callsBorrow = [createVault(alice.address), addCollateral(0, UNIT_USDC.div(3))];
      const dataBorrow = await encodeAngleBorrowSidechain(
        USDC.address,
        vaultManager2.address,
        bob.address,
        ZERO_ADDRESS,
        '0x',
        callsBorrow,
      );

      const actions = [ActionType.transfer, ActionType.borrower];
      const dataMixer = [transferData, dataBorrow];

      await router.connect(alice).mixer(permits, actions, dataMixer);
      expect(await USDC.balanceOf(bob.address)).to.be.equal(0);
      expect(await USDC.balanceOf(vaultManager2.address)).to.be.equal(UNIT_USDC.div(3));
      expect(await USDC.balanceOf(router.address)).to.be.equal(UNIT_USDC.mul(2).div(3).add(1));
      expect(await USDC.allowance(router.address, vaultManager2.address)).to.be.equal(MAX_UINT256);
      expect(await vaultManager2.collatData(0)).to.be.equal(UNIT_USDC.div(3));
    });
  });
});
