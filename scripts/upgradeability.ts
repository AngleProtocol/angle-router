import { UpgradeableContract } from '@openzeppelin/upgrades-core';
import { artifacts } from 'hardhat';

const testUpgradeability = async (name: string, file: string) => {
  const buildInfo = await artifacts.getBuildInfo(`${file}:${name}`);
  const baseContract = new UpgradeableContract(name, buildInfo?.input as any, buildInfo?.output as any);
  console.log(name);
  console.log(baseContract.getErrorReport().explain());
  console.log('');
};

const testStorage = async (name: string, file: string, nameUpgrade: string, fileUpgrade: string) => {
  const buildInfo = await artifacts.getBuildInfo(`${file}:${name}`);
  const baseContract = new UpgradeableContract(name, buildInfo?.input as any, buildInfo?.output as any);

  const upgradeBuildInfo = await artifacts.getBuildInfo(`${fileUpgrade}:${nameUpgrade}`);
  const upgradeContract = new UpgradeableContract(
    nameUpgrade,
    upgradeBuildInfo?.input as any,
    upgradeBuildInfo?.output as any,
  );
  console.log('Upgrade Testing');
  console.log(baseContract.getStorageUpgradeReport(upgradeContract).explain());
  console.log('Done');
};

async function main() {
  testUpgradeability('AngleRouterMainnet', 'contracts/AngleRouterMainnet.sol');

  testStorage(
    'OldRouterMainnet',
    'contracts/deprecated/OldRouterMainnet.sol',
    'AngleRouterMainnet',
    'contracts/AngleRouterMainnet.sol',
  );

  testStorage(
    'OldRouterPolygon',
    'contracts/deprecated/OldRouterPolygon.sol',
    'AngleRouterPolygon',
    'contracts/sidechains/polygon/AngleRouterPolygon.sol',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
