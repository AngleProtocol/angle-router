// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-IERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/external/IWETH9.sol";

import "../BaseRouter.sol";

/// @title MockRouterSidechain
/// @author Angle Core Team
/// @notice Mock contract but built for tests as if to be deployed on Ethereum
contract MockRouterSidechain is BaseRouter {
    IWETH9 public constant WETH = IWETH9(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    function _wrapNative() internal pure override returns (uint256) {
        return 0;
    }

    function _unwrapNative(uint256, address) internal pure override returns (uint256 amount) {
        return 0;
    }

    function _getNativeWrapper() internal pure override returns (IWETH9) {
        return WETH;
    }
}
