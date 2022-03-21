import yargs from 'yargs';
import { DeployFunction } from 'hardhat-deploy/types';
// import { BigNumber } from 'ethers';
import { CONTRACTS_ADDRESSES, ChainId, Interfaces } from '@angleprotocol/sdk';
import { ProxyAdmin } from '../typechain/core';

const argv = yargs.env('').boolean('ci').parseSync();

const func: DeployFunction = async ({ deployments, ethers, network }) => {
  const { deploy } = deployments;
  const [deployer] = await ethers.getSigners();

  const proxyAdminAddress = CONTRACTS_ADDRESSES[ChainId.MAINNET].ProxyAdmin!;
  const proxyAngleRouterAddress = CONTRACTS_ADDRESSES[ChainId.MAINNET].AngleRouter!;

  const governor = CONTRACTS_ADDRESSES[ChainId.MAINNET].GovernanceMultiSig! as string;
  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [governor],
  });
  await network.provider.send('hardhat_setBalance', [governor, '0x10000000000000000000000000000']);
  const governorSigner = await ethers.provider.getSigner(governor);

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

  console.log('proxyAdmin', proxyAdminAddress);
  const contractProxyAdmin = new ethers.Contract(
    proxyAdminAddress,
    Interfaces.ProxyAdmin_Interface,
    governorSigner,
  ) as ProxyAdmin;
  console.log(
    'Upgrading router ',
    proxyAngleRouterAddress,
    ' with ',
    governor,
    ' on address ',
    AngleRouterImplementation,
  );
  await (
    await contractProxyAdmin.connect(governorSigner).upgrade(proxyAngleRouterAddress, AngleRouterImplementation)
  ).wait();
};

func.tags = ['routerUpgrade'];
export default func;
