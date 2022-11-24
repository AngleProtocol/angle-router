// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

/// @title IAgTokenMultiChain
/// @author Angle Core Team
/// @notice Interface for the stablecoins `AgToken` contracts in multiple chains
interface IAgTokenMultiChain {
    function swapIn(
        address bridgeToken,
        uint256 amount,
        address to
    ) external returns (uint256);

    function swapOut(
        address bridgeToken,
        uint256 amount,
        address to
    ) external returns (uint256);
}
