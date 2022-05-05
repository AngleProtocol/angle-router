// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IFeeDistributor.sol";
import "../interfaces/ILiquidityGauge.sol";

/// @title IRouter
/// @author Angle Core Team
/// @notice Interface for Angle's `Router` contract
interface IAngleRouter {
    /// @notice External version of _claimLiquidityGauges
    /// @dev If the caller wants to send the rewards to another account it first needs to
    /// call `set_rewards_receiver(otherAccount)` on each liquidityGauges
    function claimLiquidityGauges(address user, ILiquidityGauge[] memory liquidityGauges) external;

    /// @notice External version of _claimPerpetuals
    /// @dev A Caller must first call `setApprovalForAll(AngleRouter, true)` on each perpetualManager to allow the
    /// router to claim for her
    function claimPerpetuals(
        uint256[] memory perpetualIDs,
        IERC20[] memory _stablecoins,
        IERC20[] memory _collaterals
    ) external;

    /// @notice Combine claimPerpetuals and claimLiquidityGauges
    /// @param user Address of the rewards to go to
    /// @param liquidityGauges Contracts to claim for
    /// @param perpetualIDs Perpetual IDs to claim rewards for
    /// @param _stablecoins Stablecoin contracts linked to te perpetualsIDs
    /// @param _collaterals Collateral contracts linked to te perpetualsIDs
    /// @dev If the caller wants to send the rewards to another account it first needs to
    /// call `set_rewards_receiver(otherAccount)` on each liquidityGauges
    /// @dev A Caller must first call `setApprovalForAll(AngleRouter, true)` on each perpetualManager to allow the
    /// router to claim for her
    function claimAll(
        address user,
        ILiquidityGauge[] memory liquidityGauges,
        uint256[] memory perpetualIDs,
        IERC20[] memory _stablecoins,
        IERC20[] memory _collaterals
    ) external;

    /// @notice Allow to claim weekly interest distribution and stake them
    /// @param user Address to send the
    /// @param _feeDistributor Address of the fee distributor to claim to
    /// @param _claimRewards Boolean to claim or not the accumulated rewards
    /// @dev notify users that it will stake their whole balance
    /// TODO maybe don't allow for a user params and use instead a msg.sender
    function claimWeeklyInterestsAndStake(
        address user,
        IFeeDistributorFront _feeDistributor,
        bool _claimRewards
    ) external;

    /// @notice Allow to claim weekly interest distribution and swap for a stable
    /// @param _feeDistributor Address of the fee distributor to claim to
    /// @param _stablecoin Token associated to a `StableMaster`
    /// @param minStableAmount Minimum stablecoin amount required
    /// @dev This function only works if the fee distributor distribute sanTokens
    /// TODO maybe add a _collateral params (right 3 external call just for non reverting reason instead of just feeding the sanToken to be staked)
    function claimWeeklyInterestsAndSwap(
        IFeeDistributorFront _feeDistributor,
        IERC20 _stablecoin,
        uint256 minStableAmount
    ) external;

    /// @notice External version of _mintFrom
    function mintFrom(
        address user,
        uint256 amount,
        uint256 minAmountOut,
        uint256 minStableAmount,
        IERC20 _stablecoin,
        IERC20 _collateral,
        bytes memory path,
        IERC20 _inToken
    ) external;

    /// @notice Allow to deposit a collateral (with possibly a swap) and stake directly
    /// @param user Address to send the
    /// @param amount Amount of collateral sent
    /// @param minAmountOut Minimum amount accepted for the swap to happen
    /// @param _stablecoin Token associated to a `StableMaster`
    /// @param _collateral Token to deposit
    /// @param _claimRewards Boolean to claim or not the accumulated rewards
    /// @param path Bytes Representing the path to swap your input token to the accepted collateral
    /// @param _inToken Token to (possibly) swap for the collateral
    function depositAndStake(
        address user,
        uint256 amount,
        uint256 minAmountOut,
        IERC20 _stablecoin,
        IERC20 _collateral,
        bool _claimRewards,
        bytes memory path,
        IERC20 _inToken
    ) external;

    /// @notice Allow to open a perpetual from any token that have a path on UniV3 with a collateral accepted on Angle
    /// @param owner Address to mint perpetual for
    /// @param amount Amount of in token to swap for the accepted collateral
    /// @param minAmountOut Minimum amount accepted for the swap to happen
    /// @param amountCommitted Commit amount in the perpetual
    /// @param maxOracleRate Maximum oracle rate required to have a leverage position opened
    /// @param minNetMargin Minimum margin required to have a leverage position opened
    /// @param _stablecoin Token associated to a `StableMaster`
    /// @param _collateral Collateral to mint from
    /// @param path Bytes Representing the path to swap your input token to the accepted collateral
    /// @param _inToken Token to swap for the collateral
    function openPerpetualFrom(
        address owner,
        uint256 amount,
        uint256 minAmountOut,
        uint256 amountCommitted,
        uint256 maxOracleRate,
        uint256 minNetMargin,
        IERC20 _stablecoin,
        IERC20 _collateral,
        bytes memory path,
        IERC20 _inToken
    ) external;

    /// @notice Allow to add collateral to a perpetual from any token that have a path on UniV3 with a collateral accepted on Angle
    /// @param amount Amount of in token to swap for the accepted collateral
    /// @param minAmountOut Minimum amount accepted for the swap to happen
    /// @param perpetualID Perpetual to add collateral
    /// @param _stablecoin Token associated to a `StableMaster`
    /// @param _collateral Collateral to mint from
    /// @param path Bytes Representing the path to swap your input token to the accepted collateral
    /// @param _inToken Token to swap for the collateral
    function addToPerpetualFrom(
        uint256 amount,
        uint256 minAmountOut,
        uint256 perpetualID,
        IERC20 _stablecoin,
        IERC20 _collateral,
        bytes memory path,
        IERC20 _inToken
    ) external;
}
