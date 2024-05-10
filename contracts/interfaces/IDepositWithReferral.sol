// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.5.0;

/// @title IDepositWithReferral
/// @author Angle Core Team
/// @notice Interface for Angle routing contract to notably deposit into ERC4626 with a referral address
interface IDepositWithReferral {
    /// @notice Deposits `amount` of `token` into an ERC4626 `savings` contract (with `token` as an asset)
    /// @param minSharesOut Minimum amount of shares of the ERC4626 the deposit should return. If less is
    /// obtained, the function reverts
    /// @param referrer Address which referred `msg.sender` to deposit into `savings`. Any address can be entered
    /// and the referrer address has no storage implication, it just changes the event emitted by this contract
    /// when a deposit takes place
    /// @dev This function is a wrapper on top of the base `deposit` function of ERC4626 with the ability to
    /// specify a referring address (`referrer`) as well as a slippage parameter (`minSharesOut`)
    function deposit4626Referral(
        address token,
        address savings,
        uint256 amount,
        address to,
        uint256 minSharesOut,
        address referrer
    ) external returns (uint256 sharesOut);
}
