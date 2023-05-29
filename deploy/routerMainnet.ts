import { DeployFunction } from 'hardhat-deploy/types';
import yargs from 'yargs';

const argv = yargs.env('').boolean('ci').parseSync();

const func: DeployFunction = async ({ ethers, deployments, network }) => {
  const { deploy } = deployments;
  const { deployer } = await ethers.getNamedSigners();

  console.log('Deploying router');

  console.log('Now deploying implementation');

  await deploy('AngleRouterMainnetV2_2_Implementation', {
    contract: 'AngleRouterMainnet',
    from: deployer.address,
    log: !argv.ci,
  });

  const angleRouterImplementation = (await deployments.get('AngleRouterMainnetV2_2_Implementation')).address;
  console.log(`Successfully deployed Angle router implementation at the address ${angleRouterImplementation}`);
  console.log('');
};

func.tags = ['routerMainnet'];
export default func;
