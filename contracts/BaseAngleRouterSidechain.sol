// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-IERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/IAgTokenMultiChain.sol";
import "./interfaces/ICoreBorrow.sol";
import "./interfaces/ILiquidityGauge.sol";
import "./interfaces/external/uniswap/IUniswapRouter.sol";
import "./interfaces/IVaultManager.sol";

/// @title BaseAngleRouterSidechain
/// @author Angle Core Team
/// @notice The `BaseAngleRouter` contract is a base contract for routing on the Angle Protocol in a given chain
abstract contract BaseAngleRouterSidechain is Initializable {
    using SafeERC20 for IERC20;

    /// @notice Base used for tokens
    uint256 private constant _MAX_BORROW_ACTIONS = 10;

    // =========================== Structs and Enums ===============================

    /// @notice Action types
    enum ActionType {
        transfer,
        wrap,
        wrapNative,
        sweep,
        sweepNative,
        unwrap,
        unwrapNative,
        swapIn,
        swapOut,
        uniswapV3,
        oneInch,
        claimRewards,
        gaugeDeposit,
        borrower
    }

    /// @notice Data needed to get permits
    struct PermitType {
        address token;
        address owner;
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct PermitVaultManagerType {
        address vaultManager;
        address owner;
        bool approved;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    // =============================== Event =======================================

    event CoreUpdated(address indexed _core);

    // ============================= Error Messages ================================

    error IncompatibleLengths();
    error InvalidReturnMessage();
    error NotApprovedOrOwner();
    error NotGovernor();
    error NotGovernorOrGuardian();
    error TooSmallAmountOut();
    error TransferFailed();
    error ZeroAddress();

    // =============================== References ==================================

    /// @notice Core Borrow address
    ICoreBorrow public core;
    /// @notice Address of the Uniswap V3 router potentially used for swaps
    IUniswapV3Router public uniswapV3Router;
    /// @notice Address of the 1Inch router potentially used for swaps
    address public oneInch;

    uint256[47] private __gap;

    constructor() initializer {}

    /// @notice Deploys the `AngleRouter` contract on a chain
    /// @param _core CoreBorrow contract address
    function _initialize(address _core) internal initializer {
        if (_core == address(0)) revert ZeroAddress();
        core = ICoreBorrow(_core);
    }

    // ============================== Modifiers ====================================

    /// @notice Checks whether the `msg.sender` has the governor role or not
    modifier onlyGovernor() {
        if (!core.isGovernor(msg.sender)) revert NotGovernor();
        _;
    }

    /// @notice Checks whether the `msg.sender` has the governor role or the guardian role
    modifier onlyGovernorOrGuardian() {
        if (!core.isGovernorOrGuardian(msg.sender)) revert NotGovernorOrGuardian();
        _;
    }

    // =========================== Governance utilities ============================

    /// @notice Sets a new `core` contract
    /// @dev This function should typically be called on all treasury contracts after the `setCore`
    /// function has been called on the `CoreBorrow` contract
    /// @dev One sanity check that can be performed here is to verify whether at least the governor
    /// calling the contract is still a governor in the new core
    function setCore(ICoreBorrow _core) external onlyGovernor {
        if (!_core.isGovernor(msg.sender)) revert NotGovernor();
        core = ICoreBorrow(_core);
        emit CoreUpdated(address(_core));
    }

    /// @notice Change allowance for a contract.
    /// @param tokens Addresses of the tokens to allow
    /// @param spenders Addresses to allow transfer
    /// @param amounts Amounts to allow
    /// @dev Approvals are normally given in the `addGauges` method, in the initializer and in
    /// the internal functions to process swaps with Uniswap and 1Inch
    function changeAllowance(
        IERC20[] calldata tokens,
        address[] calldata spenders,
        uint256[] calldata amounts
    ) external onlyGovernorOrGuardian {
        if (tokens.length != spenders.length || tokens.length != amounts.length) revert IncompatibleLengths();
        for (uint256 i = 0; i < tokens.length; i++) {
            _changeAllowance(tokens[i], spenders[i], amounts[i]);
        }
    }

    // =========================== Router Functionalities =========================

    /// @notice Wrapper built on top of the _claimRewards function. It allows to claim rewards for multiple
    /// gauges and perpetuals at once
    /// @param gaugeUser Address for which to fetch the rewards from the gauges
    /// @param liquidityGauges Gauges to claim on
    /// @dev If the caller wants to send the rewards to another account it first needs to
    /// call `set_rewards_receiver(otherAccount)` on each `liquidityGauge`
    function claimRewards(address gaugeUser, address[] memory liquidityGauges) external {
        _claimRewards(gaugeUser, liquidityGauges);
    }

    /// @notice Allows composable calls to different functions within the protocol
    /// @param paramsPermit Array of params `PermitType` used to do a 1 tx to approve the router on each token (can be done once by
    /// setting high approved amounts) which supports the `permit` standard. Users willing to interact with the contract
    /// with tokens that do not support permit should approve the contract for these tokens prior to interacting with it
    /// @param actions List of actions to be performed by the router (in order of execution): make sure to understand what each action performs
    /// @param data Array of encoded data for each of the actions performed in this mixer. This is where the bytes-encoded parameters
    /// for a given action are stored
    /// @dev With this function, users can specify paths to swap tokens to the desired token of their choice. Yet the protocol
    /// does not verify the payload given and cannot check that the swap performed by users actually gives the desired
    /// out token: in this case funds may be lost by the user if they don't perform a sweep action on these tokens
    function mixer(
        PermitType[] memory paramsPermit,
        ActionType[] memory actions,
        bytes[] calldata data
    ) public payable virtual {
        // Do all the permits once for all: if all tokens have already been approved, there's no need for this step
        for (uint256 i = 0; i < paramsPermit.length; i++) {
            IERC20PermitUpgradeable(paramsPermit[i].token).permit(
                paramsPermit[i].owner,
                address(this),
                paramsPermit[i].value,
                paramsPermit[i].deadline,
                paramsPermit[i].v,
                paramsPermit[i].r,
                paramsPermit[i].s
            );
        }

        // Performing actions one after the others
        for (uint256 i = 0; i < actions.length; i++) {
            if (actions[i] == ActionType.transfer) {
                (address inToken, uint256 amount) = abi.decode(data[i], (address, uint256));
                IERC20(inToken).safeTransferFrom(msg.sender, address(this), amount);
            } else if (actions[i] == ActionType.wrap) {
                (uint256 amount, uint256 minAmountOut) = abi.decode(data[i], (uint256, uint256));
                _wrap(amount, minAmountOut);
            } else if (actions[i] == ActionType.wrapNative) {
                _wrapNative();
            } else if (actions[i] == ActionType.unwrap) {
                (uint256 amount, uint256 minAmountOut, address to) = abi.decode(data[i], (uint256, uint256, address));
                _unwrap(amount, minAmountOut, to);
            } else if (actions[i] == ActionType.unwrapNative) {
                (uint256 minAmountOut, address to) = abi.decode(data[i], (uint256, address));
                _unwrapNative(minAmountOut, to);
            } else if (actions[i] == ActionType.sweep) {
                (address tokenOut, uint256 minAmountOut, address to) = abi.decode(data[i], (address, uint256, address));
                _sweep(tokenOut, minAmountOut, to);
            } else if (actions[i] == ActionType.sweepNative) {
                if (address(this).balance > 0) _safeTransferNative(msg.sender, address(this).balance);
            } else if (actions[i] == ActionType.swapIn) {
                (address canonicalToken, address bridgeToken, uint256 amount, uint256 minAmountOut, address to) = abi
                    .decode(data[i], (address, address, uint256, uint256, address));
                _swapIn(canonicalToken, bridgeToken, amount, minAmountOut, to);
            } else if (actions[i] == ActionType.swapOut) {
                (address canonicalToken, address bridgeToken, uint256 amount, uint256 minAmountOut, address to) = abi
                    .decode(data[i], (address, address, uint256, uint256, address));
                _swapOut(canonicalToken, bridgeToken, amount, minAmountOut, to);
            } else if (actions[i] == ActionType.uniswapV3) {
                (address inToken, uint256 amount, uint256 minAmountOut, bytes memory path) = abi.decode(
                    data[i],
                    (address, uint256, uint256, bytes)
                );
                _swapOnUniswapV3(IERC20(inToken), amount, minAmountOut, path);
            } else if (actions[i] == ActionType.oneInch) {
                (address inToken, uint256 minAmountOut, bytes memory payload) = abi.decode(
                    data[i],
                    (address, uint256, bytes)
                );
                _swapOn1Inch(IERC20(inToken), minAmountOut, payload);
            } else if (actions[i] == ActionType.claimRewards) {
                (address user, address[] memory claimLiquidityGauges) = abi.decode(data[i], (address, address[]));
                _claimRewards(user, claimLiquidityGauges);
            } else if (actions[i] == ActionType.gaugeDeposit) {
                (address user, uint256 amount, address gauge, bool shouldClaimRewards) = abi.decode(
                    data[i],
                    (address, uint256, address, bool)
                );
                _gaugeDeposit(user, amount, ILiquidityGauge(gauge), shouldClaimRewards);
            } else if (actions[i] == ActionType.borrower) {
                (
                    address collateral,
                    address vaultManager,
                    address to,
                    address who,
                    ActionBorrowType[] memory actionsBorrow,
                    bytes[] memory dataBorrow,
                    bytes memory repayData
                ) = abi.decode(data[i], (address, address, address, address, ActionBorrowType[], bytes[], bytes));
                _parseVaultIDs(actionsBorrow, dataBorrow, vaultManager);
                _changeAllowance(IERC20(collateral), address(vaultManager), type(uint256).max);
                _angleBorrower(vaultManager, actionsBorrow, dataBorrow, to, who, repayData);
                _changeAllowance(IERC20(collateral), address(vaultManager), 0);
            }
        }
    }

    /// @notice Wrapper built on top of the base `mixer` function to grant approval to a `VaultManager` contract before performing
    /// actions and then revoking this approval after these actions
    /// @param paramsPermitVaultManager Parameters to sign permit to give allowance to the router for a `VaultManager` contract
    /// @dev In `paramsPermitVaultManager`, the signatures for granting approvals must be given first before the signatures
    /// to revoke approvals
    /// @dev The router contract has been built to be safe to keep approvals as you cannot take an action on a vault you are not
    /// approved for, but people wary about their approvals may want to grant it before immediately revoking it, although this
    /// is just an option
    function mixerVaultManagerPermit(
        PermitVaultManagerType[] memory paramsPermitVaultManager,
        PermitType[] memory paramsPermit,
        ActionType[] memory actions,
        bytes[] calldata data
    ) external payable virtual {
        for (uint256 i = 0; i < paramsPermitVaultManager.length; i++) {
            if (paramsPermitVaultManager[i].approved) {
                IVaultManagerFunctions(paramsPermitVaultManager[i].vaultManager).permit(
                    paramsPermitVaultManager[i].owner,
                    address(this),
                    true,
                    paramsPermitVaultManager[i].deadline,
                    paramsPermitVaultManager[i].v,
                    paramsPermitVaultManager[i].r,
                    paramsPermitVaultManager[i].s
                );
            } else break;
        }
        mixer(paramsPermit, actions, data);
        // Storing the index at which starting the iteration for revoking approvals in a variable would make the stack
        // too deep
        for (uint256 i = 0; i < paramsPermitVaultManager.length; i++) {
            if (!paramsPermitVaultManager[i].approved) {
                IVaultManagerFunctions(paramsPermitVaultManager[i].vaultManager).permit(
                    paramsPermitVaultManager[i].owner,
                    address(this),
                    false,
                    paramsPermitVaultManager[i].deadline,
                    paramsPermitVaultManager[i].v,
                    paramsPermitVaultManager[i].r,
                    paramsPermitVaultManager[i].s
                );
            }
        }
    }

    receive() external payable {}

    // ===================== Internal Action Related Functions =====================

    /// @notice Internal version of the `claimRewards` function
    function _claimRewards(address gaugeUser, address[] memory liquidityGauges) internal virtual {
        for (uint256 i = 0; i < liquidityGauges.length; i++) {
            ILiquidityGauge(liquidityGauges[i]).claim_rewards(gaugeUser);
        }
    }

    /// @notice Allows to compose actions on a `VaultManager` (Angle Protocol Borrowing module)
    /// @param vaultManager Address of the vault to perform actions on
    /// @param actionsBorrow Actions type to perform on the vaultManager
    /// @param dataBorrow Data needed for each actions
    /// @param to Address to send the funds to
    /// @param who Address Swapper to handle repayments
    /// @param repayData Bytes to use at the discretion of the `msg.sender`
    function _angleBorrower(
        address vaultManager,
        ActionBorrowType[] memory actionsBorrow,
        bytes[] memory dataBorrow,
        address to,
        address who,
        bytes memory repayData
    ) internal virtual returns (PaymentData memory paymentData) {
        return IVaultManagerFunctions(vaultManager).angle(actionsBorrow, dataBorrow, msg.sender, to, who, repayData);
    }

    /// @notice Allows to deposit tokens into a gauge
    /// @param user Address on behalf of which deposits should be made in the gauge
    /// @param amount Amount to stake
    /// @param gauge Liquidity gauge to stake in
    /// @param shouldClaimRewards Whether to claim or not previously accumulated rewards
    /// @dev You should be cautious on who will receive the rewards (if `shouldClaimRewards` is true)
    /// @dev The function will revert if the gauge has not already been approved by the contract
    function _gaugeDeposit(
        address user,
        uint256 amount,
        ILiquidityGauge gauge,
        bool shouldClaimRewards
    ) internal virtual {
        gauge.deposit(amount, user, shouldClaimRewards);
    }

    /// @notice Sweeps tokens from the router contract
    /// @param tokenOut Token to sweep
    /// @param minAmountOut Minimum amount of tokens to recover
    /// @param to Address to which tokens should be sent
    function _sweep(
        address tokenOut,
        uint256 minAmountOut,
        address to
    ) internal virtual {
        uint256 balanceToken = IERC20(tokenOut).balanceOf(address(this));
        _slippageCheck(balanceToken, minAmountOut);
        if (balanceToken > 0) {
            IERC20(tokenOut).safeTransfer(to, balanceToken);
        }
    }

    /// @notice Allows to swap any token to an accepted collateral via UniswapV3 (if there is a path)
    /// @param inToken Token used as entrance of the swap
    /// @param amount Amount of in token to swap for the accepted collateral
    /// @param minAmountOut Minimum amount accepted for the swap to happen
    /// @param path Bytes representing the path to swap your input token to the accepted collateral
    function _swapOnUniswapV3(
        IERC20 inToken,
        uint256 amount,
        uint256 minAmountOut,
        bytes memory path
    ) internal returns (uint256 amountOut) {
        // Approve transfer to the `uniswapV3Router`
        // Since this router is supposed to be a trusted contract, we can leave the allowance to the token
        _checkAllowance(IERC20(inToken), address(uniswapV3Router), amount);
        amountOut = uniswapV3Router.exactInput(
            ExactInputParams(path, address(this), block.timestamp, amount, minAmountOut)
        );
    }

    /// @notice Swaps an inToken to another token via 1Inch Router
    /// @param payload Bytes needed for 1Inch router to process the swap
    /// @dev The `payload` given is expected to be obtained from 1Inch API
    function _swapOn1Inch(
        IERC20 inToken,
        uint256 minAmountOut,
        bytes memory payload
    ) internal returns (uint256 amountOut) {
        // Approve transfer to the `oneInch` address
        // Since this router is supposed to be a trusted contract, we can leave the allowance to the token
        _changeAllowance(IERC20(inToken), oneInch, type(uint256).max);
        //solhint-disable-next-line
        (bool success, bytes memory result) = oneInch.call(payload);
        if (!success) _revertBytes(result);

        amountOut = abi.decode(result, (uint256));
        _slippageCheck(amountOut, minAmountOut);
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

    // ===================== Virtual Functions to Override =========================

    /// @notice Wraps a token to another wrapped version of it
    /// @dev It can be used to get wstETH from stETH
    function _wrap(uint256 amount, uint256 minAmountOut) internal virtual returns (uint256);

    /// @notice Unwraps a wrapped token to another version of it
    /// @dev It can be used to get stETH from wstETH
    function _unwrap(
        uint256 amount,
        uint256 minAmountOut,
        address to
    ) internal virtual returns (uint256);

    /// @notice Wraps the native token of a chain to its wrapped version
    /// @dev It can be used for ETH to wETH or MATIC to wMATIC
    /// @dev The amount to wrap is to be specified in the `msg.value`
    function _wrapNative() internal virtual returns (uint256);

    /// @notice Unwraps the wrapped version of a token to the native chain token
    /// @dev It can be used for wETH to ETH or wMATIC to MATIC
    /// @dev The amount to wrap is usually specified in the `msg.value`
    function _unwrapNative(uint256 minAmountOut, address to) internal virtual returns (uint256);

    // ======================== Internal Utility Functions =========================

    /// @notice Changes allowance of this contract for a given token
    /// @param token Address of the token to change allowance
    /// @param spender Address to change the allowance of
    /// @param amount Amount allowed
    function _changeAllowance(
        IERC20 token,
        address spender,
        uint256 amount
    ) internal {
        uint256 currentAllowance = token.allowance(address(this), spender);
        if (currentAllowance < amount) {
            token.safeIncreaseAllowance(spender, amount - currentAllowance);
        } else if (currentAllowance > amount) {
            token.safeDecreaseAllowance(spender, currentAllowance - amount);
        }
    }

    /// @notice Checks the allowance for a contract and updates it to the max if it is not big enough
    /// @param token Token for which allowance should be checked
    /// @param spender Address to grant allowance to
    /// @param amount Minimum amount of tokens needed for the allowance
    function _checkAllowance(
        IERC20 token,
        address spender,
        uint256 amount
    ) internal {
        uint256 currentAllowance = token.allowance(address(this), spender);
        if (currentAllowance < amount) token.safeIncreaseAllowance(spender, type(uint256).max - currentAllowance);
    }

    /// @notice Transfer amount of the native token to the `to` address
    /// @dev Forked from Solmate: https://github.com/Rari-Capital/solmate/blob/main/src/utils/SafeTransferLib.sol
    function _safeTransferNative(address to, uint256 amount) internal {
        bool success;

        //solhint-disable-next-line
        assembly {
            // Transfer the ETH and store if it succeeded or not.
            success := call(gas(), to, amount, 0, 0, 0, 0)
        }

        if (!success) revert TransferFailed();
    }

    /// @notice Parses the actions submitted to the router contract to interact with a `VaultManager` and makes sure that
    /// the calling address is well approved for all the vaults with which it is interacting
    /// @dev If such check was not made, we could end up in a situation where an address has given an approval for all its
    /// vaults to the router contract, and another address takes advantage of this to instruct actions on these other vaults
    /// to the router: it is hence super important for the router to pay attention to the fact that the addresses interacting
    /// with a vault are approved for this vault
    function _parseVaultIDs(
        ActionBorrowType[] memory actionsBorrow,
        bytes[] memory dataBorrow,
        address vaultManager
    ) internal view {
        if (actionsBorrow.length >= _MAX_BORROW_ACTIONS) revert IncompatibleLengths();
        // The amount of vaults to check cannot be bigger than the maximum amount of tokens
        // supported
        uint256[_MAX_BORROW_ACTIONS] memory vaultIDsToCheckOwnershipOf;
        bool createVaultAction;
        uint256 lastVaultID;
        uint256 vaultIDLength;
        for (uint256 i = 0; i < actionsBorrow.length; i++) {
            uint256 vaultID;
            // If there is a createVault action, the router should not worry about looking at
            // next vaultIDs given equal to 0
            if (actionsBorrow[i] == ActionBorrowType.createVault) {
                createVaultAction = true;
                continue;
                // There are then different ways depending on the action to find the `vaultID`
            } else if (
                actionsBorrow[i] == ActionBorrowType.removeCollateral || actionsBorrow[i] == ActionBorrowType.borrow
            ) {
                (vaultID, ) = abi.decode(dataBorrow[i], (uint256, uint256));
            } else if (actionsBorrow[i] == ActionBorrowType.closeVault) {
                vaultID = abi.decode(dataBorrow[i], (uint256));
            } else if (actionsBorrow[i] == ActionBorrowType.getDebtIn) {
                (vaultID, , , ) = abi.decode(dataBorrow[i], (uint256, address, uint256, uint256));
            } else continue;
            // If we need to add a null `vaultID`, we look at the `vaultIDCount` in the `VaultManager`
            // if there has not been any specific action
            if (vaultID == 0) {
                if (createVaultAction) {
                    continue;
                } else {
                    // If we haven't stored the last `vaultID`, we need to fetch it
                    if (lastVaultID == 0) {
                        lastVaultID = IVaultManagerStorage(vaultManager).vaultIDCount();
                    }
                    vaultID = lastVaultID;
                }
            }

            // Check if this `vaultID` has already been verified
            for (uint256 j = 0; j < vaultIDLength; j++) {
                if (vaultIDsToCheckOwnershipOf[j] == vaultID) {
                    // If yes, we continue to the next iteration
                    continue;
                }
            }
            // Verify this new vaultID and add it to the list
            if (!IVaultManagerFunctions(vaultManager).isApprovedOrOwner(msg.sender, vaultID)) {
                revert NotApprovedOrOwner();
            }
            vaultIDsToCheckOwnershipOf[vaultIDLength] = vaultID;
            vaultIDLength += 1;
        }
    }

    /// @notice Checks whether the amount obtained during a swap is not too small
    function _slippageCheck(uint256 amount, uint256 minAmountOut) internal pure {
        if (amount < minAmountOut) revert TooSmallAmountOut();
    }

    /// @notice Internal function used for error handling
    function _revertBytes(bytes memory errMsg) internal pure {
        if (errMsg.length > 0) {
            //solhint-disable-next-line
            assembly {
                revert(add(32, errMsg), mload(errMsg))
            }
        }
        revert InvalidReturnMessage();
    }

}
