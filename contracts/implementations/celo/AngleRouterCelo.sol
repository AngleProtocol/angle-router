// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

import "../../BaseRouter.sol";

/// @title AngleRouterCelo
/// @author Angle Core Team
/// @notice Router contract built specifially for Angle use cases on Celo
contract AngleRouterCelo is BaseRouter {
    /// @inheritdoc BaseRouter
    /// @dev There is no wCELO contract on CELO
    function _getNativeWrapper() internal pure override returns (IWETH9) {
        return IWETH9(0x0000000000000000000000000000000000000000);
    }
}
