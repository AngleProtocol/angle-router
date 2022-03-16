import yargs from 'yargs';
import { DeployFunction } from 'hardhat-deploy/types';
// import { BigNumber } from 'ethers';
import { CONTRACTS_ADDRESSES, ChainId, Interfaces } from '@angleprotocol/sdk';
import { ProxyAdmin } from '../typechain/core';

const argv = yargs.env('').boolean('ci').parseSync();

const func: DeployFunction = async ({ deployments, ethers, network }) => {
  const { deploy } = deployments;
  const [deployer] = await ethers.getSigners();

  const chainIdNetwork = network.config.chainId as ChainId;

  const proxyAdminAddress = CONTRACTS_ADDRESSES[chainIdNetwork].ProxyAdmin!;
  const proxyAngleRouterAddress = CONTRACTS_ADDRESSES[chainIdNetwork].AngleRouter!;

  console.log('-----------------------------------------------------------------------');
  console.log('Let us get it started with the deployment of Angle new router');
  console.log('');
  console.log('');
  console.log('Now deploying AngleRouter');
  console.log('Starting with the implementation');
  await deploy('AngleRouter_Implementation', {
    contract: 'AngleRouter',
    from: deployer.address,
    log: !argv.ci,
  });

  const AngleRouterImplementation = (await deployments.get('AngleRouter_Implementation')).address;

  console.log(`Successfully deployed Angle router implementation at the address ${AngleRouterImplementation}`);
  console.log('');

  //   const proxyAdminAddress: string = proxyAdmin !== undefined ? proxyAdmin : '0x';
  console.log('proxyAdmin', proxyAdminAddress);
  const contractProxyAdmin = new ethers.Contract(
    proxyAdminAddress,
    Interfaces.ProxyAdmin_Interface,
    deployer,
  ) as ProxyAdmin;
  console.log('Upgrading router with ', deployer.address);
  await (await contractProxyAdmin.connect(deployer).upgrade(proxyAngleRouterAddress, AngleRouterImplementation)).wait();
};

func.tags = ['routerUpgradeRinkeby'];
export default func;
