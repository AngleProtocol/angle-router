// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.12;

import "../interfaces/IOracle.sol";

contract MockOracle is IOracle {
    event Update(uint256 _peg);

    uint256 public base = 10**18;
    uint256 public override inBase;
    uint256 public precision = 10**18;
    uint256 public rate;
    bool public outdated;

    /// @notice Initiate with a fixe change rate
    constructor(uint256 rate_, uint256 _inDecimals) {
        rate = rate_;
        inBase = 10**_inDecimals;
    }

    /// @notice Mock read
    function read() external view override returns (uint256) {
        return rate;
    }

    function readAll() external view override returns (uint256, uint256) {
        return (rate, rate);
    }

    /// @notice Mock readLower
    function readLower() external view override returns (uint256) {
        return rate;
    }

    /// @notice Mock readUpper
    function readUpper() external view override returns (uint256) {
        return rate;
    }

    /// @notice Mock readQuote
    function readQuote(uint256 baseAmount) external view override returns (uint256) {
        return (baseAmount * rate * base) / (precision * inBase);
    }

    /// @notice Mock readQuoteLower
    function readQuoteLower(uint256 baseAmount) external view override returns (uint256) {
        return (baseAmount * rate * base) / (precision * inBase);
    }

    /// @notice change oracle rate
    function update(uint256 newRate) external {
        rate = newRate;
    }

    function changeInBase(uint256 newInBase) external {
        inBase = newInBase;
    }
}
