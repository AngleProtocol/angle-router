import yargs from 'yargs';
/* simulation script to run on mainnet fork */
import { network, ethers, deployments } from 'hardhat';
// eslint-disable-next-line camelcase
import { ProxyAdmin, ProxyAdmin__factory } from '../../typechain';
import { ChainId, CONTRACTS_ADDRESSES } from '@angleprotocol/sdk';

const argv = yargs.env('').boolean('ci').parseSync();

async function main() {
  const { deploy } = deployments;
  const [deployer] = await ethers.getSigners();

  const chainIdNetwork = ChainId.MAINNET;

  const proxyAdminAddress = CONTRACTS_ADDRESSES[chainIdNetwork].ProxyAdmin!;
  const governor = CONTRACTS_ADDRESSES[ChainId.MAINNET].GovernanceMultiSig! as string;
  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [governor],
  });
  await network.provider.send('hardhat_setBalance', [governor, '0x10000000000000000000000000000']);
  const governorSigner = await ethers.provider.getSigner(governor);

  const proxyAgEURAddress = CONTRACTS_ADDRESSES[ChainId.MAINNET].agEUR.AgToken as string;

  await deploy('MockAgToken_Implementation', {
    contract: 'MockAgToken',
    from: deployer.address,
    log: !argv.ci,
  });
  const agEURImplementation = (await deployments.get('MockAgToken_Implementation')).address;
  const contractProxyAdmin = new ethers.Contract(
    proxyAdminAddress,
    ProxyAdmin__factory.createInterface(),
    governorSigner,
  ) as ProxyAdmin;

  await (await contractProxyAdmin.connect(governorSigner).upgrade(proxyAgEURAddress, agEURImplementation)).wait();

  console.log('Success');
  console.log('');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
