# <img src="logo.svg" alt="Angle Router Contracts" height="40px"> Angle Router Contracts

[![CI](https://github.com/AngleProtocol/angle-router/workflows/CI/badge.svg)](https://github.com/AngleProtocol/angle-router/actions?query=workflow%3ACI)

## Documentation

This repository contains router contracts for the Angle Protocol. These contracts are designed to facilitate the composition of actions on top of Angle and other protocols in a single transaction.

There is one router contract per chain on which the protocol is natively deployed with a very similar implementation each time.

Across all chains, router contracts implementations rely on a **mixer()** function that can be called with a set of instructions, including the different actions it can perform and their parameters.

Instructions can range from transferring funds to another address, performing a swap on 1Inch, opening a perpetual, depositing in an ERC4626 contract, wrapping the native token of a chain (e.g ETH to wETH), ...

Some actions are possible on some chains but not on others, and we recommend to look at the implementation of the contract to view what kind of actions are supported.

The list of all potentially available actions is defined in the `ActionType` enum.

## Setup

### Install packages

You can install all dependencies by running

```bash
yarn
forge i
```

### Create `.env` file

In order to interact with non local networks, you must create an `.env` that has:

- `MNEMONIC`
- network key
- `ETHERSCAN_API_KEY`

For additional keys, you can check the `.env.example` file.

Warning: always keep your confidential information safe.

### Tests

Contracts in this repo rely on Hardhat tests. You can run tests as follows:

```bash
yarn hardhat:test ./test/hardhat/router/baseRouter.test.ts
```

You can also check the coverage of the tests with:

```bash
yarn hardhat:coverage
```

### Coverage

```bash
yarn hardhat:coverage
```

### Deploying

```bash
yarn deploy mainnet
```

Make sure to change the tag corresponding to the file you're deploying, and to adapt the `CoreBorrow`, `Treasury` and `ProxyAdmin` to your use case.

## Foundry Installation

```bash
curl -L https://foundry.paradigm.xyz | bash

source /root/.zshrc
# or, if you're under bash: source /root/.bashrc

foundryup
```

To install the standard library:

```bash
forge install foundry-rs/forge-std
```

To update libraries:

```bash
forge update
```

## Media

Don't hesitate to reach out on [Twitter](https://twitter.com/AngleProtocol) 🐦
