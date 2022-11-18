import { ChainId, registry } from '@angleprotocol/sdk';
import { DeployFunction } from 'hardhat-deploy/types';
import yargs from 'yargs';

import { AngleRouterPolygon__factory } from '../typechain';

const argv = yargs.env('').boolean('ci').parseSync();

const func: DeployFunction = async ({ ethers, deployments, network }) => {
  const { deploy } = deployments;
  const { deployer } = await ethers.getNamedSigners();
  console.log(`Deploying the router on ${network.name}`);
  const json = await import('./networks/' + network.name + '.json');

  let chainId: ChainId;
  let chainName: string;

  if (!network.live) {
    chainId = ChainId.POLYGON;
    chainName = 'Polygon';
  } else {
    chainId = network.config.chainId as ChainId;
    chainName = network.name.charAt(0).toUpperCase() + network.name.substring(1);
  }
  const proxyAdmin = registry(chainId)?.ProxyAdminGuardian;
  const coreBorrow = registry(chainId)?.CoreBorrow;

  const contractName = `AngleRouter${chainName}`;

  console.log('Now deploying the implementation');
  await deploy(`${contractName}_Implementation`, {
    contract: contractName,
    from: deployer.address,
    log: !argv.ci,
  });

  const routerImplementation = (await ethers.getContract(`${contractName}_Implementation`)).address;
  console.log(`Successfully deployed the implementation for the router at ${routerImplementation}`);
  console.log('Now deploying the proxy contract');
  const dataRouter = new ethers.Contract(
    routerImplementation,
    AngleRouterPolygon__factory.createInterface(),
  ).interface.encodeFunctionData('initializeRouter', [coreBorrow, json.uniswapV3Router, json.oneInchRouter]);
  await deploy(`${contractName}`, {
    contract: 'TransparentUpgradeableProxy',
    from: deployer.address,
    args: [routerImplementation, proxyAdmin, dataRouter],
    log: !argv.ci,
  });
  const router = (await deployments.get(`${contractName}`)).address;
  console.log(`Successfully deployed ${contractName} at the address ${router}`);

  console.log(`${router} ${routerImplementation} ${proxyAdmin} ${dataRouter}`);
  console.log('');
  console.log('Success');
};

func.tags = ['routerSidechain'];
export default func;
