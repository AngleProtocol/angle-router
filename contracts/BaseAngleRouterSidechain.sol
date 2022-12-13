// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

import "./interfaces/IAgTokenMultiChain.sol";
import "./BaseRouter.sol";

/// @title BaseAngleRouterSidechain
/// @author Angle Core Team
/// @notice Extension of the `BaseRouter` contract for sidechains
abstract contract BaseAngleRouterSidechain is BaseRouter {
    // =========================== ROUTER FUNCTIONALITIES ==========================

    /// @notice Wrapper built on top of the `_claimRewards` function. It allows to claim rewards for multiple
    /// gauges at once
    /// @param gaugeUser Address for which to fetch the rewards from the gauges
    /// @param liquidityGauges Gauges to claim on
    /// @dev If the caller wants to send the rewards to another account it first needs to
    /// call `set_rewards_receiver(otherAccount)` on each `liquidityGauge`
    function claimRewards(address gaugeUser, address[] calldata liquidityGauges) external {
        _claimRewards(gaugeUser, liquidityGauges);
    }

    /// @inheritdoc BaseRouter
    function _chainSpecificAction(ActionType action, bytes calldata data) internal override {
        if (action == ActionType.swapIn) {
            (address canonicalToken, address bridgeToken, uint256 amount, uint256 minAmountOut, address to) = abi
                .decode(data, (address, address, uint256, uint256, address));
            _swapIn(canonicalToken, bridgeToken, amount, minAmountOut, to);
        } else if (action == ActionType.swapOut) {
            (address canonicalToken, address bridgeToken, uint256 amount, uint256 minAmountOut, address to) = abi
                .decode(data, (address, address, uint256, uint256, address));
            _swapOut(canonicalToken, bridgeToken, amount, minAmountOut, to);
        }
    }

    /// @notice Wraps a bridge token to its corresponding canonical version
    function _swapIn(
        address canonicalToken,
        address bridgeToken,
        uint256 amount,
        uint256 minAmountOut,
        address to
    ) internal returns (uint256) {
        amount = IAgTokenMultiChain(canonicalToken).swapIn(bridgeToken, amount, to);
        _slippageCheck(amount, minAmountOut);
        return amount;
    }

    /// @notice Unwraps a canonical token for one of its bridge version
    function _swapOut(
        address canonicalToken,
        address bridgeToken,
        uint256 amount,
        uint256 minAmountOut,
        address to
    ) internal returns (uint256) {
        amount = IAgTokenMultiChain(canonicalToken).swapOut(bridgeToken, amount, to);
        _slippageCheck(amount, minAmountOut);
        return amount;
    }
}
