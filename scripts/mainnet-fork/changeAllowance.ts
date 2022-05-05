import { network, ethers } from 'hardhat';
// eslint-disable-next-line camelcase
import { AngleRouter, AngleRouter__factory, ProxyAdmin, ProxyAdmin__factory } from '../../typechain';
import { ChainId, CONTRACTS_ADDRESSES } from '@angleprotocol/sdk';
import { MAX_UINT256 } from '../../test/utils/helpers';

async function main() {
  console.log('Getting the transaction data for the allowance transaction');
  const chainIdNetwork = ChainId.MAINNET;

  const proxyAdminAddress = CONTRACTS_ADDRESSES[chainIdNetwork].ProxyAdmin!;
  const governor = CONTRACTS_ADDRESSES[ChainId.MAINNET].GovernanceMultiSig! as string;
  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [governor],
  });
  await network.provider.send('hardhat_setBalance', [governor, '0x10000000000000000000000000000']);
  const governorSigner = await ethers.provider.getSigner(governor);

  const proxyAngleRouterAddress = CONTRACTS_ADDRESSES[ChainId.MAINNET].AngleRouter!;
  const AngleRouterImplementation = '0xd8ef817FFb926370dCaAb8F758DDb99b03591A5e';
  const contractProxyAdmin = new ethers.Contract(
    proxyAdminAddress,
    ProxyAdmin__factory.createInterface(),
    governorSigner,
  ) as ProxyAdmin;
  console.log('First upgrading the router in mainnet fork');
  await (
    await contractProxyAdmin.connect(governorSigner).upgrade(proxyAngleRouterAddress, AngleRouterImplementation)
  ).wait();
  console.log('Success');

  // eslint-disable-next-line camelcase
  const angleRouter = new ethers.Contract(
    proxyAngleRouterAddress,
    AngleRouter__factory.createInterface(),
    governorSigner,
  ) as AngleRouter;
  const WSTETHAddress = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';
  const stETHAddress = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';
  console.log('Now performing the changeAllowance transaction');
  const tx = await angleRouter.connect(governorSigner).changeAllowance([stETHAddress], [WSTETHAddress], [MAX_UINT256]);
  console.log(tx.data);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
