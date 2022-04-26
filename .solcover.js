module.exports = {
  norpc: true,
  testCommand: 'yarn test',
  compileCommand: 'yarn compile:hardhat',
  skipFiles: [
    'agToken/polygon',
    'agToken/AgTokenIntermediateUpgrade.sol',
    'external',
    'interfaces',
    'mock',
    'oracle/OracleChainlinkMultiTemplate.sol',
    'oracle/implementations/OracleWSTETHEURChainlink.sol',
    'oracle/implementations/OracleBTCEURChainlink.sol',
    'oracle/implementations/OracleETHEURChainlink.sol',
    // Router here is a copy pasta of the router in another repo
    'router',
    'reactor/BaseReactorStorage.sol',
    'vaultManager/VaultManagerStorage.sol',
  ],
  providerOptions: {
    default_balance_ether: '10000000000000000000000000',
  },
  mocha: {
    fgrep: '[skip-on-coverage]',
    invert: true,
  },
};