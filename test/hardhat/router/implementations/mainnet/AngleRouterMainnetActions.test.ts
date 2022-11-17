import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, BytesLike } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import hre, { contract, ethers } from 'hardhat';

import {
  AngleRouterMainnet,
  AngleRouterMainnet__factory,
  ERC20,
  ERC20__factory,
  Mock1Inch,
  Mock1Inch__factory,
  MockAgToken,
  MockAgToken__factory,
  MockCoreBorrow,
  MockCoreBorrow__factory,
  MockRouterSidechain,
  MockRouterSidechain__factory,
  MockTokenPermit,
  MockTokenPermit__factory,
  MockUniswapV3Router,
  MockUniswapV3Router__factory,
} from '../../../../../typechain';
import { expect } from '../../../../../utils/chai-setup';
import { ActionType, TypePermit } from '../../../../../utils/helpers';
import { deployUpgradeable, expectApprox, MAX_UINT256, ZERO_ADDRESS } from '../../../utils/helpers';

contract('AngleRouterMainnet - Actions', () => {
  let deployer: SignerWithAddress;
  let USDC: MockTokenPermit;
  let agEUR: MockAgToken;
  let wETH: ERC20;
  let core: MockCoreBorrow;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let uniswap: MockUniswapV3Router;
  let oneInch: Mock1Inch;
  let router: AngleRouterMainnet;
  let USDCdecimal: BigNumber;
  let permits: TypePermit[];
  let ANGLE: ERC20;
  let veANGLE: ERC20;

  before(async () => {
    ({ deployer, alice, bob } = await ethers.getNamedSigners());
    USDCdecimal = BigNumber.from('6');
    permits = [];
    ANGLE = (await ethers.getContractAt(ERC20__factory.abi, '0x31429d1856aD1377A8A0079410B297e1a9e214c2')) as ERC20;
    veANGLE = (await ethers.getContractAt(ERC20__factory.abi, '0x0C462Dbb9EC8cD1630f1728B2CFD2769d09f0dd5')) as ERC20;
  });

  beforeEach(async () => {
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.ETH_NODE_URI_MAINNET,
            // Changing Ethereum fork block breaks some tests
            blockNumber: 15983159,
          },
        },
      ],
    });
    // If the forked-network state needs to be reset between each test, run this
    router = (await deployUpgradeable(new AngleRouterMainnet__factory(deployer))) as AngleRouterMainnet;
    USDC = (await new MockTokenPermit__factory(deployer).deploy('USDC', 'USDC', USDCdecimal)) as MockTokenPermit;
    agEUR = (await deployUpgradeable(new MockAgToken__factory(deployer))) as MockAgToken;
    await agEUR.initialize('agEUR', 'agEUR', ZERO_ADDRESS, ZERO_ADDRESS);
    uniswap = (await new MockUniswapV3Router__factory(deployer).deploy(
      USDC.address,
      agEUR.address,
    )) as MockUniswapV3Router;
    oneInch = (await new Mock1Inch__factory(deployer).deploy(USDC.address, agEUR.address)) as Mock1Inch;
    core = (await new MockCoreBorrow__factory(deployer).deploy()) as MockCoreBorrow;
    await core.toggleGovernor(alice.address);
    await core.toggleGuardian(alice.address);
    await core.toggleGuardian(bob.address);
    await router.initialize(core.address, uniswap.address, oneInch.address, [], [], [], []);
  });

  describe('initialize', () => {
    it('success - correctly initialized', async () => {
      expect(await router.core()).to.be.equal(core.address);
      expect(await router.uniswapV3Router()).to.be.equal(uniswap.address);
      expect(await router.oneInch()).to.be.equal(oneInch.address);
      expect(await router.mapStableMasters('0x1a7e4e63778B4f12a199C062f3eFdD288afCBce8')).to.be.equal(
        '0x5adDc89785D75C86aB939E9e15bfBBb7Fc086A87',
      );
      expect(await ANGLE.allowance(router.address, veANGLE.address)).to.be.equal(MAX_UINT256);
      await expect(router.initializeRouter(core.address, uniswap.address, oneInch.address)).to.be.revertedWith(
        'Initializable: contract is already initialized',
      );
      await expect(
        router.initialize(core.address, uniswap.address, oneInch.address, [], [], [], []),
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });
  });
});
