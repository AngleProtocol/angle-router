import yargs from 'yargs';
/* simulation script to run on mainnet fork */
import { network, ethers, deployments } from 'hardhat';
// eslint-disable-next-line camelcase
import { AngleRouter, AngleRouter__factory, ProxyAdmin, ProxyAdmin__factory } from '../../typechain';
import { BigNumber } from 'ethers';
import { ChainId, CONTRACTS_ADDRESSES } from '@angleprotocol/sdk';
import { expect } from '../../utils/chai-setup';

const argv = yargs.env('').boolean('ci').parseSync();

async function main() {
  const { deploy } = deployments;
  const [deployer] = await ethers.getSigners();

  const collaterals = ['USDC', 'FRAX', 'DAI', 'FEI'] as const;
  const chainIdNetwork = ChainId.MAINNET;

  const proxyAdminAddress = CONTRACTS_ADDRESSES[chainIdNetwork].ProxyAdmin!;
  const governor = CONTRACTS_ADDRESSES[ChainId.MAINNET].GovernanceMultiSig! as string;
  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [governor],
  });
  await network.provider.send('hardhat_setBalance', [governor, '0x10000000000000000000000000000']);
  const governorSigner = await ethers.provider.getSigner(governor);

  const proxyAngleRouterAddress = CONTRACTS_ADDRESSES[chainIdNetwork].AngleRouter!;

  await deploy('AngleRouter_Implementation', {
    contract: 'AngleRouter',
    from: deployer.address,
    log: !argv.ci,
  });
  const AngleRouterImplementation = (await deployments.get('AngleRouter_Implementation')).address;
  console.log('proxyAdmin', proxyAdminAddress);
  const contractProxyAdmin = new ethers.Contract(
    proxyAdminAddress,
    ProxyAdmin__factory.createInterface(),
    governorSigner,
  ) as ProxyAdmin;

  await (
    await contractProxyAdmin.connect(governorSigner).upgrade(proxyAngleRouterAddress, AngleRouterImplementation)
  ).wait();

  // eslint-disable-next-line camelcase
  const angleRouter = new ethers.Contract(
    proxyAngleRouterAddress,
    AngleRouter__factory.createInterface(),
    governorSigner,
  ) as AngleRouter;

  const angleAddress = CONTRACTS_ADDRESSES[chainIdNetwork].ANGLE!;
  const veAngleAddress = CONTRACTS_ADDRESSES[chainIdNetwork].veANGLE!;
  const WETH9Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const WSTETHAddress = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';
  const agEURAddress = CONTRACTS_ADDRESSES[chainIdNetwork].agEUR.AgToken as string;
  const stableMasterEURAddress = CONTRACTS_ADDRESSES[chainIdNetwork].agEUR.StableMaster as string;

  const json = await import('../../deploy/networks/mainnet.json');

  expect(await angleRouter.ANGLE()).to.be.equal(angleAddress);
  expect(await angleRouter.VEANGLE()).to.be.equal(veAngleAddress);
  expect(await angleRouter.WETH9()).to.be.equal(WETH9Address);
  expect(await angleRouter.WSTETH()).to.be.equal(WSTETHAddress);
  expect(await angleRouter.oneInch()).to.be.equal(json.oneInch.Aggregatorv4);
  expect(await angleRouter.uniswapV3Router()).to.be.equal(json.Uniswap.RouterV3);

  expect(await angleRouter.mapStableMasters(agEURAddress)).to.be.equal(stableMasterEURAddress);
  for (const col of collaterals) {
    const pair = await angleRouter.mapPoolManagers(stableMasterEURAddress, json[col]);
    const poolManager = CONTRACTS_ADDRESSES[chainIdNetwork].agEUR?.collaterals?.[col]?.PoolManager as string;
    const perpetualManager = CONTRACTS_ADDRESSES[chainIdNetwork].agEUR?.collaterals?.[col]?.PerpetualManager as string;
    const gauge = CONTRACTS_ADDRESSES[chainIdNetwork].agEUR?.collaterals?.[col]?.LiquidityGauge as string;
    const sanToken = CONTRACTS_ADDRESSES[chainIdNetwork].agEUR?.collaterals?.[col]?.SanToken as string;
    expect(pair[0]).to.be.equal(poolManager);
    expect(pair[1]).to.be.equal(perpetualManager);
    expect(pair[2]).to.be.equal(sanToken);
    expect(pair[3]).to.be.equal(gauge);
  }

  console.log('Success');
  console.log('');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
