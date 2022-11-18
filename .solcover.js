module.exports = {
  norpc: true,
  testCommand: 'yarn test',
  compileCommand: 'yarn compile:hardhat',
  configureYulOptimizer: true,
  skipFiles: ['external', 'interfaces', 'mock'],
  providerOptions: {
    default_balance_ether: '10000000000000000000000000',
  },
  mocha: {
    fgrep: '[skip-on-coverage]',
    invert: true,
  },
};
