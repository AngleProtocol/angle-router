import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumberish, BytesLike, ethers } from 'ethers';
import { AngleRouter } from '../typechain';
import { ParamsSwapTypeStruct, PermitTypeStruct, TransferTypeStruct } from '../typechain/AngleRouter';
import { TypePermit } from './helpers';

type Call = {
  action: number;
  data: BytesLike;
};

export function createVault(to: string): Call {
  return { action: 0, data: ethers.utils.defaultAbiCoder.encode(['address'], [to]) };
}

export function closeVault(vaultID: number): Call {
  return { action: 1, data: ethers.utils.defaultAbiCoder.encode(['uint256'], [vaultID]) };
}

export function addCollateral(vaultID: number, collateralAmount: BigNumberish): Call {
  return { action: 2, data: ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'], [vaultID, collateralAmount]) };
}

export function removeCollateral(vaultID: number, collateralAmount: BigNumberish): Call {
  return { action: 3, data: ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'], [vaultID, collateralAmount]) };
}

export function repayDebt(vaultID: number, stablecoinAmount: BigNumberish): Call {
  return { action: 4, data: ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'], [vaultID, stablecoinAmount]) };
}

export function borrow(vaultID: number, stablecoinAmount: BigNumberish): Call {
  return { action: 5, data: ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'], [vaultID, stablecoinAmount]) };
}

export function getDebtIn(
  vaultID: number,
  vaultManager: string,
  dstVaultID: number,
  stablecoinAmount: BigNumberish,
): Call {
  return {
    action: 6,
    data: ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'address', 'uint256', 'uint256'],
      [vaultID, vaultManager, dstVaultID, stablecoinAmount],
    ),
  };
}

export function permit(permitData: TypePermit): Call {
  return {
    action: 7,
    data: ethers.utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'uint256', 'bytes32', 'bytes32'],
      [permitData.owner, permitData.value, permitData.deadline, permitData.v, permitData.r, permitData.s],
    ),
  };
}

export function encodeAngleBorrow(
  vaultManager: string,
  to: string,
  who: string,
  repayData: BytesLike,
  calls: Call[],
): BytesLike {
  const actions: number[] = [];
  const data: BytesLike[] = [];
  calls.forEach(o => {
    actions.push(o.action);
    data.push(o.data);
  });

  console.log('before encoding the data is ', data);
  return ethers.utils.defaultAbiCoder.encode(
    ['address', 'address', 'address', 'uint256[]', 'bytes[]', 'bytes'],
    [vaultManager, to, who, actions, data, repayData],
  );
}

// export async function mixer(
//   router: AngleRouter,
//   signer: SignerWithAddress,
//   paramsPermit: PermitTypeStruct[],
//   paramsTransfer: TransferTypeStruct[],
//   paramsSwap: ParamsSwapTypeStruct[],
//   calls: Call[],
// ): Promise<void> {
//   const actions: number[] = [];
//   const datas: BytesLike[] = [];
//   calls.forEach(o => {
//     actions.push(o.action);
//     datas.push(o.data);
//   });
// }