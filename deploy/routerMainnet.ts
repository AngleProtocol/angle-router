import { ChainId, registry } from '@angleprotocol/sdk';
import { DeployFunction } from 'hardhat-deploy/types';
import yargs from 'yargs';

import { ZERO_ADDRESS } from '../test/hardhat/utils/helpers';
import { AngleRouterMainnet__factory } from '../typechain';

const argv = yargs.env('').boolean('ci').parseSync();

const func: DeployFunction = async ({ ethers, deployments, network }) => {
  const { deploy } = deployments;
  const { deployer } = await ethers.getNamedSigners();

  console.log('Deploying router');

  const chainId = ChainId.MAINNET;

  const proxyAdmin = registry(chainId)?.ProxyAdminGuardian;
  const coreBorrow = registry(chainId)?.CoreBorrow;
  const angle = registry(chainId)?.ANGLE;

  const poolManagers: string[] = [];
  const gauges: string[] = [];
  const stablecoins: string[] = [];
  const justLiquidityGauges: boolean[] = [];

  const json = await import('./networks/' + network.name + '.json');

  const uniswapRouter = json.uniswapV3Router;
  const oneInchAggregator = json.oneInchRouter;

  const collateralAssets = ['USDC', 'DAI', 'WETH', 'FRAX'];

  for (const collateralName of collateralAssets) {
    const collateral = registry(chainId)?.agEUR?.collaterals?.[collateralName as 'USDC' | 'DAI' | 'WETH' | 'FRAX'];
    const poolManager = collateral?.PoolManager;
    let gauge: string;
    gauge = collateral?.LiquidityGauge!;
    poolManagers.push(poolManager as string);
    if (gauge === undefined) gauge = ZERO_ADDRESS;
    gauges.push(gauge as string);
    stablecoins.push(registry(chainId)?.agEUR?.AgToken as string);
    justLiquidityGauges.push(false);
  }
  console.log(poolManagers);
  console.log(gauges);
  console.log(stablecoins);

  console.log('Now deploying implementation');

  await deploy('AngleRouterMainnet_Implementation', {
    contract: 'AngleRouterMainnet',
    from: deployer.address,
    log: !argv.ci,
  });

  const angleRouterImplementation = (await deployments.get('AngleRouterMainnet_Implementation')).address;

  console.log(`Successfully deployed Angle router implementation at the address ${angleRouterImplementation}`);
  console.log('');
  console.log('Now deploying the proxy');

  const dataRouter = new ethers.Contract(
    angleRouterImplementation,
    AngleRouterMainnet__factory.createInterface(),
  ).interface.encodeFunctionData('initialize', [
    coreBorrow,
    uniswapRouter,
    oneInchAggregator,
    angle,
    stablecoins,
    poolManagers,
    gauges,
    justLiquidityGauges,
  ]);

  await deploy('AngleRouterMainnet', {
    contract: 'TransparentUpgradeableProxy',
    from: deployer.address,
    args: [angleRouterImplementation, proxyAdmin, dataRouter],
    log: !argv.ci,
  });
};

func.tags = ['routerMainnet'];
export default func;
