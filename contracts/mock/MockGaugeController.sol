// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.7;

import "../interfaces/IGaugeController.sol";

/// @notice MockGaugeController contract
contract MockGaugeController is IGaugeController {
    address public unAllowedGauge = address(0);
    mapping(address => uint256) public weights;
    mapping(address => int128) public gauges;
    uint256 public constant BASE = 10**18;
    uint256 public baseWeight = BASE / 2;

    constructor() {}

    // solhint-disable-next-line
    function gauge_types(address addr) external view override returns (int128) {
        if (addr == unAllowedGauge) {
            return -1;
        }
        return gauges[addr];
    }

    // solhint-disable-next-line
    function gauge_relative_weight(address addr, uint256) external view override returns (uint256) {
        return weights[addr];
    }

    // solhint-disable-next-line
    function gauge_relative_weight_write(address addr, uint256) external override returns (uint256) {
        weights[addr] = baseWeight;
        return weights[addr];
    }

    function setBaseWeight(uint256 _baseWeight) external {
        baseWeight = _baseWeight;
    }

    function setGauge(address gauge, int128 _type) external {
        gauges[gauge] = _type;
    }
}
