// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.12;

import "../implementations/mainnet/AngleRouterMainnet.sol";

contract MockAngleRouterMainnet is AngleRouterMainnet {
    address public veAngle;

    function setAngleAndVeANGLE(address _veAngle) external {
        veAngle = _veAngle;
    }

    function _getVeANGLE() internal view override returns (IVeANGLE) {
        return IVeANGLE(veAngle);
    }
}
