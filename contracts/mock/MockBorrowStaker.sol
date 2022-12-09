// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

contract MockBorrowStaker {
    mapping(address => uint256) public counter;

    // solhint-disable-next-line
    function claim_rewards(address _addr) external returns (uint256[] memory) {
        _addr;
        counter[_addr] += 1;
        uint256[] memory returnValue = new uint256[](2);
        returnValue[0] = 1;
        returnValue[1] = 2;
        return returnValue;
    }
}
