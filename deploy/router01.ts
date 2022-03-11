import yargs from 'yargs';
import { DeployFunction } from 'hardhat-deploy/types';
import { CONTRACTS_ADDRESSES, ChainId, Interfaces } from '@angleprotocol/sdk';

import params from './networks';
import { AngleRouter__factory } from '../typechain';

const argv = yargs.env('').boolean('ci').parseSync();

const func: DeployFunction = async ({ ethers, deployments, network }) => {
  const { deploy } = deployments;
  const { deployer, guardian, governor } = await ethers.getNamedSigners();

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
    let proxyAdmin: string;
    if (!network.live) {
      // If we're in mainnet fork, we're using the `ProxyAdmin` address from mainnet
      proxyAdmin = CONTRACTS_ADDRESSES[ChainId.MAINNET].ProxyAdmin!;
    } else {
      // Otherwise, we're using the proxy admin address from the desired network
      proxyAdmin = CONTRACTS_ADDRESSES[network.config.chainId as ChainId].ProxyAdmin!;
    }

    console.log('Now deploying angleRouter');
    console.log('Starting with the implementation');
    await deploy('AngleRouter_Implementation', {
      contract: 'AngleRouter',
      from: deployer.address,
      log: !argv.ci,
    });

    const angleRouterImplementation = (await deployments.get('AngleRouter_Implementation')).address;
    console.log(`Successfully deployed the implementation for AngleRouter at ${angleRouterImplementation}`);
    console.log('');

    const dataRouter = new ethers.Contract(
      angleRouterImplementation,
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

    console.log('Now deploying the Proxy');
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
