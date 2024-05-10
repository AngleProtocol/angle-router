// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

import "../../interfaces/IFeeDistributorFront.sol";
import "../../interfaces/ISanToken.sol";
import "../../interfaces/IStableMasterFront.sol";
import "../../interfaces/IVeANGLE.sol";

import "../../BaseRouter.sol";

// ============================= STRUCTS AND ENUMS =============================

/// @notice References to the contracts associated to a collateral for a stablecoin
struct Pairs {
    IPoolManager poolManager;
    IPerpetualManagerFrontWithClaim perpetualManager;
    ISanToken sanToken;
    ILiquidityGauge gauge;
}

/// @title AngleRouterMainnet
/// @author Angle Core Team
/// @notice Router contract built specifially for Angle use cases on Ethereum
/// @dev Previous implementation with an initialization function can be found here:
/// https://etherscan.io/address/0x1b2ffdad478d8770ea0e085bdd4e31120736fcd7#code
contract AngleRouterMainnet is BaseRouter {
    using SafeERC20 for IERC20;

    // =================================== ERRORS ==================================

    error InvalidParams();

    // ================================== MAPPINGS =================================

    /// @notice Maps an agToken to its counterpart `StableMaster`
    mapping(IERC20 => IStableMasterFront) public mapStableMasters;
    /// @notice Maps a `StableMaster` to a mapping of collateral token to its counterpart `PoolManager`
    mapping(IStableMasterFront => mapping(IERC20 => Pairs)) public mapPoolManagers;

    uint256[48] private __gapMainnet;

    // =========================== ROUTER FUNCTIONALITIES ==========================

    /// @inheritdoc BaseRouter
    function _chainSpecificAction(ActionType action, bytes calldata data) internal override {
        if (action == ActionType.claimWeeklyInterest) {
            (address user, address feeDistributor, bool letInContract) = abi.decode(data, (address, address, bool));
            _claimWeeklyInterest(user, IFeeDistributorFront(feeDistributor), letInContract);
        } else if (action == ActionType.veANGLEDeposit) {
            (address user, uint256 amount) = abi.decode(data, (address, uint256));
            _depositOnLocker(user, amount);
        }
    }

    /// @inheritdoc BaseRouter
    function _getNativeWrapper() internal pure override returns (IWETH9) {
        return IWETH9(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    }

    /// @notice Deposits ANGLE on an existing locker
    /// @param user Address to deposit for
    /// @param amount Amount to deposit
    function _depositOnLocker(address user, uint256 amount) internal {
        _getVeANGLE().deposit_for(user, amount);
    }

    /// @notice Claims weekly interest distribution and if wanted transfers it to the contract for future use
    /// @param user Address to claim for
    /// @param _feeDistributor Address of the fee distributor to claim to
    /// @dev If `letInContract` (and hence if funds are transferred to the router), you should approve the `angleRouter` to
    /// transfer the token claimed from the `feeDistributor`
    function _claimWeeklyInterest(
        address user,
        IFeeDistributorFront _feeDistributor,
        bool letInContract
    ) internal {
        uint256 amount = _feeDistributor.claim(user);
        if (letInContract) {
            // Fetching info from the `FeeDistributor` to process correctly the withdrawal
            IERC20 token = IERC20(_feeDistributor.token());
            token.safeTransferFrom(msg.sender, address(this), amount);
        }
    }

    // ========================= INTERNAL UTILITY FUNCTIONS ========================

    /// @notice Returns the veANGLE address
    function _getVeANGLE() internal view virtual returns (IVeANGLE) {
        return IVeANGLE(0x0C462Dbb9EC8cD1630f1728B2CFD2769d09f0dd5);
    }
}
