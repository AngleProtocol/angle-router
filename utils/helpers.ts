import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber } from 'ethers';
import { ethers, network } from 'hardhat';

import { MockTokenPermit, MockTokenPermit__factory } from '../typechain';
import { multBy10e15, parseAmount } from './bignumber';
import { expect } from './chai-setup';

export const BASE = parseAmount.ether(1);
export const BASE_PARAMS = parseAmount.gwei(1);
export const BASE_15 = multBy10e15(15);
export const BASE_RATE = BigNumber.from(10 ** 2);
export const BASE_ORACLE = parseAmount.ether(1);
export const REWARD_AMOUNT = parseAmount.ether(1);
export const HOUR = 3600;
export const DAY = HOUR * 24;
export const WEEK = DAY * 7;

export const MAX_MINT_AMOUNT = BigNumber.from(2).pow(BigNumber.from(256)).sub(BigNumber.from(1));

export type TypePermit = {
  token: string;
  owner: string;
  value: BigNumber;
  deadline: number;
  v: number;
  r: Buffer;
  s: Buffer;
};

export async function initToken(
  name: string,
  decimals = BigNumber.from('18'),
  governor: SignerWithAddress,
): Promise<{
  token: MockTokenPermit;
}> {
  const token = (await new MockTokenPermit__factory(governor).deploy(name, name, decimals)) as MockTokenPermit;
  return { token };
}

export async function expectApproxDelta(actual: BigNumber, expected: BigNumber, delta: BigNumber): Promise<void> {
  const margin = expected.div(delta);
  expect(expected.lte(actual.add(margin)));
  expect(expected.gte(actual.sub(margin)));
}

export async function impersonate(
  address: string,
  cb?: (_account: SignerWithAddress) => Promise<void>,
  stopImpersonating = true,
): Promise<SignerWithAddress> {
  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [address],
  });

  const account = await ethers.getSigner(address);
  if (cb) {
    await cb(account);
  }

  if (stopImpersonating) {
    await network.provider.request({
      method: 'hardhat_stopImpersonatingAccount',
      params: [address],
    });
  }
  return account;
}

export enum ActionType {
  transfer,
  wrapNative,
  unwrapNative,
  sweep,
  sweepNative,
  uniswapV3,
  oneInch,
  claimRewards,
  gaugeDeposit,
  borrower,
  swapper,
  mint4626,
  deposit4626,
  redeem4626,
  withdraw4626,
  prepareRedeemSavingsRate,
  claimRedeemSavingsRate,
  swapIn,
  swapOut,
  claimWeeklyInterest,
  withdraw,
  mint,
  deposit,
  openPerpetual,
  addToPerpetual,
  veANGLEDeposit,
  claimRewardsWithPerps,
  deposit4626Referral
}
