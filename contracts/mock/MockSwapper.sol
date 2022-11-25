// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockSwapper {
    using SafeERC20 for IERC20;

    function swap(
        IERC20 inToken,
        IERC20 outToken,
        address outTokenRecipient,
        uint256 outTokenOwed,
        uint256 inTokenObtained,
        bytes memory
    ) external {
        inToken.safeTransferFrom(msg.sender, address(this), inTokenObtained);
        outToken.safeTransfer(outTokenRecipient, outTokenOwed);
    }
}
