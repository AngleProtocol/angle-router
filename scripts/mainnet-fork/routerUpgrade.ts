import yargs from 'yargs';
/* simulation script to run on mainnet fork */
import { network, ethers, deployments } from 'hardhat';
// eslint-disable-next-line camelcase
import { AngleRouterMainnet, AngleRouterMainnet__factory, ProxyAdmin, ProxyAdmin__factory } from '../../typechain';
import { ChainId, registry } from '@angleprotocol/sdk';
import { expect } from '../../utils/chai-setup';

const argv = yargs.env('').boolean('ci').parseSync();

async function main() {
  const { deploy } = deployments;
  const [deployer] = await ethers.getSigners();


  const proxyAdminAddress = registry(ChainId.MAINNET)?.ProxyAdmin!
  const governor = registry(ChainId.MAINNET)?.Governor
  const router = registry(ChainId.MAINNET)?.AngleRouterV2!
  const core = registry(ChainId.MAINNET)?.CoreBorrow!
  
  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [governor],
  });
  await network.provider.send('hardhat_setBalance', [governor, '0x10000000000000000000000000000']);
  const governorSigner = await ethers.provider.getSigner(governor);

  await deploy('AngleRouterMainnet_Implementation', {
    contract: 'AngleRouterMainnet',
    from: deployer.address,
    log: !argv.ci,
  });
  const AngleRouterImplementation = (await deployments.get('AngleRouterMainnet_Implementation')).address;
  const contractProxyAdmin = new ethers.Contract(
    proxyAdminAddress,
    ProxyAdmin__factory.createInterface(),
    governorSigner,
  ) as ProxyAdmin;

  await (
    await contractProxyAdmin.connect(governorSigner).upgrade(router, AngleRouterImplementation)
  ).wait();

  // eslint-disable-next-line camelcase
  const angleRouter = new ethers.Contract(
    router,
    AngleRouterMainnet__factory.createInterface(),
    governorSigner,
  ) as AngleRouterMainnet;

  expect(await angleRouter.core()).to.be.equal(core);
  expect(await angleRouter.oneInch()).to.be.equal("0x111111125421cA6dc452d289314280a0f8842A65");
  expect(await angleRouter.uniswapV3Router()).to.be.equal("0xE592427A0AEce92De3Edee1F18E0157C05861564");

  console.log('Success');
  console.log('');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
