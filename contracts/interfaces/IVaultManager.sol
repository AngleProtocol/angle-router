// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ITreasury.sol";

// ========================= Key Structs and Enums =============================

/// @notice Data to track during a series of action the amount to give or receive in stablecoins and collateral
/// to the caller or associated addresses
struct PaymentData {
    // Stablecoin amount the contract should give
    uint256 stablecoinAmountToGive;
    // Stablecoin amount owed to the contract
    uint256 stablecoinAmountToReceive;
    // Collateral amount the contract should give
    uint256 collateralAmountToGive;
    // Collateral amount owed to the contract
    uint256 collateralAmountToReceive;
}

/// @notice Data stored to track someone's loan (or equivalently called position)
struct Vault {
    // Amount of collateral deposited in the vault
    uint256 collateralAmount;
    // Normalized value of the debt (that is to say of the stablecoins borrowed)
    uint256 normalizedDebt;
}

/// @notice Actions possible when composing calls to the different entry functions proposed
enum ActionBorrowType {
    createVault,
    closeVault,
    addCollateral,
    removeCollateral,
    repayDebt,
    borrow,
    getDebtIn,
    permit
}

// ========================= Interfaces =============================

/// @title IVaultManagerFunctions
/// @author Angle Core Team
/// @notice Interface for the `VaultManager` contract
/// @dev This interface only contains functions of the contract which are called by other contracts
/// of this module (without getters)
interface IVaultManagerFunctions {
    /// @notice Allows composability between calls to the different entry points of this module. Any user calling
    /// this function can perform any of the allowed actions in the order of their choice
    /// @param actions Set of actions to perform
    /// @param datas Data to be decoded for each action: it can include like the `vaultID` or the
    /// @param from Address from which stablecoins will be taken if one action includes burning stablecoins. This address
    /// should either be the `msg.sender` or be approved by the latter
    /// @param to Address to which stablecoins and/or collateral will be sent in case of
    /// @return paymentData Struct containing the final transfers executed
    /// @dev This function is optimized to reduce gas cost due to payment from or to the user and that expensive calls
    /// or computations (like `oracleValue`) are done only once
    function angle(
        ActionBorrowType[] memory actions,
        bytes[] memory datas,
        address from,
        address to
    ) external payable returns (PaymentData memory paymentData);

    /// @notice Allows composability between calls to the different entry points of this module. Any user calling
    /// this function can perform any of the allowed actions in the order of their choice
    /// @param actions Set of actions to perform
    /// @param datas Data to be decoded for each action: it can include like the `vaultID` or the
    /// @param from Address from which stablecoins will be taken if one action includes burning stablecoins. This address
    /// should either be the `msg.sender` or be approved by the latter
    /// @param to Address to which stablecoins and/or collateral will be sent in case of
    /// @param who Address of the contract to handle in case of repayment of stablecoins from received collateral
    /// @param repayData Data to pass to the repayment contract in case of
    /// @return paymentData Struct containing the final transfers executed
    /// @dev This function is optimized to reduce gas cost due to payment from or to the user and that expensive calls
    /// or computations (like `oracleValue`) are done only once
    function angle(
        ActionBorrowType[] memory actions,
        bytes[] memory datas,
        address from,
        address to,
        address who,
        bytes memory repayData
    ) external payable returns (PaymentData memory paymentData);
}

/// @title IVaultManagerStorage
/// @author Angle Core Team
/// @notice Interface for the `VaultManager` contract
/// @dev This interface contains getters of the contract's public variables used by other contracts
/// of this module
interface IVaultManagerStorage {
    /// @notice Reference to the `treasury` contract handling this `VaultManager`
    function treasury() external view returns (ITreasury);

    /// @notice Reference to the collateral handled by this `VaultManager`
    function collateral() external view returns (IERC20);
}
