import yargs from 'yargs';
import { DeployFunction } from 'hardhat-deploy/types';
// import { BigNumber } from 'ethers';
import { CONTRACTS_ADDRESSES, ChainId, Interfaces } from '@angleprotocol/sdk';
import { ProxyAdmin } from '../typechain';

const argv = yargs.env('').boolean('ci').parseSync();

const func: DeployFunction = async ({ deployments, ethers, network }) => {
  const { deploy } = deployments;
  const [deployer] = await ethers.getSigners();

  const proxyAdminAddress = CONTRACTS_ADDRESSES[ChainId.RINKEBY].ProxyAdmin!;
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
  console.log('proxyAdmin ', proxyAdminAddress);

  const contractProxyAdmin = new ethers.Contract(
    proxyAdminAddress,
    Interfaces.ProxyAdmin_Interface,
    deployer,
  ) as ProxyAdmin;

  console.log('Upgrading router with ', deployer.address);
  await (
    await contractProxyAdmin
      .connect(deployer)
      .upgrade('0x12AC5CD0042baaAe3bf1264a778f5A07E781C685', AngleRouterImplementation)
  ).wait();
};

func.tags = ['routerUpgradeRinkeby'];
export default func;
