import yargs from 'yargs';
import { DeployFunction } from 'hardhat-deploy/types';
// import { BigNumber } from 'ethers';
import { CONTRACTS_ADDRESSES, ChainId, Interfaces } from '@angleprotocol/sdk';
import { ProxyAdmin, ProxyAdmin__factory } from '../typechain';

const argv = yargs.env('').boolean('ci').parseSync();

const func: DeployFunction = async ({ deployments, ethers, network }) => {
  const { deploy } = deployments;
  const [deployer] = await ethers.getSigners();

  const proxyAdminAddress = CONTRACTS_ADDRESSES[ChainId.POLYGON].ProxyAdmin!;
  const proxyAngleRouterAddress = CONTRACTS_ADDRESSES[ChainId.POLYGON].AngleRouter!;

  console.log('-----------------------------------------------------------------------');
  console.log('Let us get it started with the upgrade of Angle new router');
  console.log('');
  console.log(`The address of the router is ${proxyAngleRouterAddress}`);
  console.log('');
  console.log('Now deploying AngleRouter');
  console.log('Starting with the implementation');
  await deploy('AngleRouterPolygon_NewImplementation', {
    contract: 'AngleRouterPolygon',
    from: deployer.address,
    log: !argv.ci,
  });

  const AngleRouterImplementation = (await deployments.get('AngleRouterPolygon_NewImplementation')).address;

  console.log(`Successfully deployed Angle router implementation at the address ${AngleRouterImplementation}`);
  console.log('');

  // if (!network.live) {
  //   console.log('Now performing the upgrade');
  //   const governor = CONTRACTS_ADDRESSES[ChainId.MAINNET].GovernanceMultiSig! as string;
  //   await network.provider.request({
  //     method: 'hardhat_impersonateAccount',
  //     params: [governor],
  //   });
  //   await network.provider.send('hardhat_setBalance', [governor, '0x10000000000000000000000000000']);
  //   const governorSigner = await ethers.provider.getSigner(governor);

  //   console.log('proxyAdmin', proxyAdminAddress);
  //   const contractProxyAdmin = new ethers.Contract(
  //     proxyAdminAddress,
  //     Interfaces.ProxyAdmin_Interface,
  //     governorSigner,
  //   ) as ProxyAdmin;
  //   await (
  //     await contractProxyAdmin.connect(governorSigner).upgrade(proxyAngleRouterAddress, AngleRouterImplementation)
  //   ).wait();

  //   console.log('Success');
  //   console.log('');
  // }
};

func.tags = ['routerUpgrade'];
export default func;
