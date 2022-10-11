// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockStableMaster {
    address public agToken;

    constructor(address _agToken) {
        agToken = _agToken;
    }
}
