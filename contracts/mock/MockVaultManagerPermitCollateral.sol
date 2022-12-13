// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

import "./MockVaultManagerPermit.sol";

contract MockVaultManagerPermitCollateral is MockVaultManagerPermit {
    using Address for address;
    using SafeERC20 for IERC20;

    mapping(uint256 => uint256) public collatData;

    constructor(string memory _name) MockVaultManagerPermit(_name) {}

    function angle(
        ActionBorrowType[] memory actions,
        bytes[] memory datas,
        address,
        address,
        address,
        bytes memory
    ) public payable override returns (PaymentData memory) {
        for (uint256 i; i < actions.length; ++i) {
            ActionBorrowType action = actions[i];
            action;
            if (action == ActionBorrowType.addCollateral) {
                (uint256 vaultID, uint256 collateralAmount) = abi.decode(datas[i], (uint256, uint256));
                collatData[vaultID] += collateralAmount;
                collateral.safeTransferFrom(msg.sender, address(this), collateralAmount);
            }
        }
        PaymentData memory returnValue;
        return returnValue;
    }

    uint256[49] private __gap;
}
