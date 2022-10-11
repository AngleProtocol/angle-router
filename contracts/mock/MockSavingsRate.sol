// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

contract MockSavingsRate is ERC4626 {
    constructor(IERC20Metadata asset_) ERC20("savingsRate", "sr") ERC4626(asset_) {}
}
