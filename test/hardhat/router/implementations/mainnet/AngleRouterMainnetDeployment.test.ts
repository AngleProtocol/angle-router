import { ChainId, registry } from '@angleprotocol/sdk';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import hre, { contract, ethers } from 'hardhat';

import { AngleRouterMainnet, AngleRouterMainnet__factory } from '../../../../../typechain';
import { expect } from '../../../../../utils/chai-setup';
import { deployUpgradeable, ZERO_ADDRESS } from '../../../utils/helpers';

contract('AngleRouterMainnet - Deployment', () => {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let router: AngleRouterMainnet;
  let poolManagers: string[];
  let gauges: string[];
  let stablecoins: string[];
  let stablecoin: string;
  let stableMaster: string;
  let usdc: string;
  let dai: string;
  let weth: string;
  let frax: string;

  before(async () => {
    ({ deployer, alice } = await ethers.getNamedSigners());
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
    await hre.network.provider.send('hardhat_setBalance', [alice.address, '0x10000000000000000000000000000']);
    // If the forked-network state needs to be reset between each test, run this
    router = (await deployUpgradeable(new AngleRouterMainnet__factory(deployer))) as AngleRouterMainnet;

    const chainId = ChainId.MAINNET;

    const coreBorrow = registry(chainId)?.CoreBorrow;
    const angle = registry(chainId)?.ANGLE;
    const uniswapRouter = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
    const oneInchRouter = '0x1111111254fb6c44bAC0beD2854e76F90643097d';
    stablecoin = registry(chainId)?.agEUR?.AgToken as string;
    stableMaster = registry(chainId)?.agEUR?.StableMaster as string;
    usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    dai = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
    frax = '0x853d955aCEf822Db058eb8505911ED77F175b99e';
    weth = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

    poolManagers = [];
    gauges = [];
    stablecoins = [];

    const justLiquidityGauges: boolean[] = [];
    const collateralAssets = ['USDC', 'DAI', 'WETH', 'FRAX'];
    for (const collateralName of collateralAssets) {
      const collateral = registry(chainId)?.agEUR?.collaterals?.[collateralName as 'USDC' | 'DAI' | 'WETH' | 'FRAX'];
      const poolManager = collateral?.PoolManager;
      poolManagers.push(poolManager as string);
      const gauge = collateral?.LiquidityGauge;
      if (gauge === undefined) gauges.push(ZERO_ADDRESS);
      else gauges.push(gauge as string);
      stablecoins.push(stablecoin);
      justLiquidityGauges.push(false);
    }
    await router.initialize(
      coreBorrow as string,
      uniswapRouter,
      oneInchRouter,
      angle as string,
      stablecoins,
      poolManagers,
      gauges,
      justLiquidityGauges,
    );
  });

  describe('initialization', () => {
    it('success - correct initialization', async () => {
      expect(await router.mapStableMasters(stablecoin)).to.be.equal(stableMaster);

      // USDC
      const usdcData = await router.mapPoolManagers(stableMaster, usdc);
      expect(usdcData.poolManager).to.be.equal(poolManagers[0]);
      expect(usdcData.gauge).to.be.equal(gauges[0]);
      expect(usdcData.perpetualManager).to.be.equal(
        registry(ChainId.MAINNET)?.agEUR?.collaterals?.USDC?.PerpetualManager as string,
      );
      expect(usdcData.sanToken).to.be.equal(registry(ChainId.MAINNET)?.agEUR?.collaterals?.USDC?.SanToken as string);

      // DAI
      const daiData = await router.mapPoolManagers(stableMaster, dai);
      expect(daiData.poolManager).to.be.equal(poolManagers[1]);
      expect(daiData.gauge).to.be.equal(gauges[1]);
      expect(daiData.perpetualManager).to.be.equal(
        registry(ChainId.MAINNET)?.agEUR?.collaterals?.DAI?.PerpetualManager as string,
      );
      expect(daiData.sanToken).to.be.equal(registry(ChainId.MAINNET)?.agEUR?.collaterals?.DAI?.SanToken as string);

      // WETH
      const wethData = await router.mapPoolManagers(stableMaster, weth);
      expect(wethData.poolManager).to.be.equal(poolManagers[2]);
      expect(wethData.gauge).to.be.equal(gauges[2]);
      expect(wethData.perpetualManager).to.be.equal(
        registry(ChainId.MAINNET)?.agEUR?.collaterals?.WETH?.PerpetualManager as string,
      );
      expect(wethData.sanToken).to.be.equal(registry(ChainId.MAINNET)?.agEUR?.collaterals?.WETH?.SanToken as string);

      // FRAX
      const fraxData = await router.mapPoolManagers(stableMaster, frax);
      expect(fraxData.poolManager).to.be.equal(poolManagers[3]);
      expect(fraxData.gauge).to.be.equal(gauges[3]);
      expect(fraxData.perpetualManager).to.be.equal(
        registry(ChainId.MAINNET)?.agEUR?.collaterals?.FRAX?.PerpetualManager as string,
      );
      expect(fraxData.sanToken).to.be.equal(registry(ChainId.MAINNET)?.agEUR?.collaterals?.FRAX?.SanToken as string);
    });
  });
});
