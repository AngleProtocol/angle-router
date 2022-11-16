// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.12;

import "./interfaces/external/uniswap/IUniswapRouter.sol";
import "./interfaces/IAgTokenMultiChain.sol";
import "./BaseRouter.sol";

/// @title BaseAngleRouterSidechain
/// @author Angle Core Team
/// @notice Extension of the `BaseRouter` contract for sidechains beyond Ethereum
abstract contract BaseAngleRouterSidechain is BaseRouter {
    // ============================== EVENTS / ERRORS ==============================

    event CoreUpdated(address indexed _core);

    error NotGovernor();

    // ================================= REFERENCES ================================

    /// @notice Core Borrow address
    ICoreBorrow public core;
    /// @notice Address of the Uniswap V3 router potentially used for swaps
    IUniswapV3Router public uniswapV3Router;
    /// @notice Address of the 1Inch router potentially used for swaps
    address public oneInch;

    uint256[47] private __gap;

    constructor() initializer {}

    /// @notice Deploys the router contract on a chain
    function initializeRouter(
        address _core,
        address _uniswapRouter,
        address _oneInch
    ) public virtual initializer {
        if (_core == address(0)) revert ZeroAddress();
        core = ICoreBorrow(_core);
        uniswapV3Router = IUniswapV3Router(_uniswapRouter);
        oneInch = _oneInch;
    }

    // =========================== ROUTER FUNCTIONALITIES ==========================

    /// @notice Wrapper built on top of the `_claimRewards` function. It allows to claim rewards for multiple
    /// gauges at once
    /// @param gaugeUser Address for which to fetch the rewards from the gauges
    /// @param liquidityGauges Gauges to claim on
    /// @dev If the caller wants to send the rewards to another account it first needs to
    /// call `set_rewards_receiver(otherAccount)` on each `liquidityGauge`
    function claimRewards(address gaugeUser, address[] memory liquidityGauges) external {
        _claimRewards(gaugeUser, liquidityGauges);
    }

    /// @inheritdoc BaseRouter
    function _chainSpecificAction(ActionType action, bytes memory data) internal override {
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

    /// @inheritdoc BaseRouter
    function _get1InchRouter() internal view virtual override returns (address) {
        return oneInch;
    }

    /// @inheritdoc BaseRouter
    function _getUniswapRouter() internal view virtual override returns (IUniswapV3Router) {
        return uniswapV3Router;
    }

    /// @inheritdoc BaseRouter
    function _isGovernorOrGuardian(address user) internal view override returns (bool) {
        return core.isGovernorOrGuardian(user);
    }

    /// @inheritdoc BaseRouter
    function _setRouter(address router, uint8 who) internal virtual override {
        if (who == 0) uniswapV3Router = IUniswapV3Router(router);
        else oneInch = router;
    }

    // ============================ GOVERNANCE UTILITIES ===========================

    /// @notice Sets a new `core` contract
    function setCore(ICoreBorrow _core) external {
        if (!core.isGovernor(msg.sender) || !_core.isGovernor(msg.sender)) revert NotGovernor();
        core = ICoreBorrow(_core);
        emit CoreUpdated(address(_core));
    }
}
