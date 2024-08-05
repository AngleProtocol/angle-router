// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

import "../../BaseRouter.sol";

/// @title AngleRouterBase
/// @author Angle Core Team
/// @notice Router contract built specifially for Angle use cases on Base
contract AngleRouterBase is BaseRouter {
    /// @inheritdoc BaseRouter
    /// @dev There is no wCELO contract on CELO
    function _getNativeWrapper() internal pure override returns (IWETH9) {
        return IWETH9(0x4200000000000000000000000000000000000006);
    }
}
