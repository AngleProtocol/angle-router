import yargs from 'yargs';
import { DeployFunction } from 'hardhat-deploy/types';
import { CONTRACTS_ADDRESSES, ChainId } from '@angleprotocol/sdk';

import params from './networks';
// eslint-disable-next-line camelcase
import { AngleRouter__factory } from '../typechain';

const argv = yargs.env('').boolean('ci').parseSync();

const func: DeployFunction = async ({ ethers, deployments, network }) => {
  const { deploy } = deployments;
  const [deployer, guardian, governor] = await ethers.getSigners();

  console.log('Deploying router');

  const chainIdNetwork = network.config.chainId as ChainId;

  let governorAddress: string;
  let guardianAddress: string;
  const poolManagers: string[] = [];
  const gauges: string[] = [];

  const json = await import('./networks/' + network.name + '.json');

  const uniswapRouter = json.Uniswap.RouterV3;
  let oneInchAggregator = json.oneInch.Aggregatorv4;

  const constants = params.poolsParameters;

  if (chainIdNetwork === ChainId.RINKEBY) {
    governorAddress = governor.address;
    guardianAddress = guardian.address;
    // didn't find 1inch aggregator contract address on rinkeby
    oneInchAggregator = uniswapRouter;
  } else if (chainIdNetwork === ChainId.MAINNET) {
    governorAddress = json.governanceMultiSig;
    guardianAddress = json.guardian;
  } else {
    throw new Error('Unsupported chainId!');
  }

  const stableMaster = CONTRACTS_ADDRESSES[chainIdNetwork].agEUR?.StableMaster;

  for (const collateralName of Object.keys(constants.EUR)) {
    const poolManagerUnd = CONTRACTS_ADDRESSES[chainIdNetwork].agEUR?.collaterals?.[collateralName].PoolManager;
    const gaugeUnd = CONTRACTS_ADDRESSES[chainIdNetwork].agEUR?.collaterals?.[collateralName].LiquidityGauge;
    if (poolManagerUnd !== undefined && gaugeUnd !== undefined) {
      poolManagers.push(poolManagerUnd);
      gauges.push(gaugeUnd);
    }
  }

  try {
    await deployments.get('AngleRouter');
  } catch {
    console.log('deploy implementation');

    const proxyAdmin = CONTRACTS_ADDRESSES[network.config.chainId as ChainId].ProxyAdmin!;

    console.log('ProxyAdmin', proxyAdmin);
    console.log('deployer ', deployer.address);

    console.log('ProxyAdmin', proxyAdmin);

    await deploy('AngleRouter_Implementation', {
      contract: 'AngleRouter',
      from: deployer.address,
      log: !argv.ci,
    });

    const angleRouterImplementation = (await deployments.get('AngleRouter_Implementation')).address;

    console.log(`Successfully deployed Angle router implementation at the address ${angleRouterImplementation}`);
    console.log('');

    const dataRouter = new ethers.Contract(
      angleRouterImplementation,
      // eslint-disable-next-line camelcase
      AngleRouter__factory.createInterface(),
    ).interface.encodeFunctionData('initialize', [
      governorAddress,
      guardianAddress,
      uniswapRouter,
      oneInchAggregator,
      stableMaster,
      poolManagers,
      gauges,
    ]);

    await deploy('AngleRouter', {
      contract: 'TransparentUpgradeableProxy',
      from: deployer.address,
      args: [angleRouterImplementation, proxyAdmin, dataRouter],
      log: !argv.ci,
    });
  }
};

func.tags = ['angleRouter'];
export default func;
