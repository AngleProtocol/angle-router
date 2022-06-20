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

    /// @notice Base used for params
    uint256 public constant BASE_PARAMS = 10**9;
    /// @notice Base used for params
    uint256 private constant _MAX_TOKENS = 10;

    // =========================== Structs and Enums ===============================

    /// @notice Action types
    enum ActionType {
        claimRewards,
        gaugeDeposit,
        borrower, 
        swapIn,
        swapOut
    }

    /// @notice All possible swaps
    enum SwapType {
        UniswapV3,
        oneINCH,
        WrapStETH,
        None
    }

    /// @notice Params for swaps
    /// @param inToken Token to swap
    /// @param outToken Token to swap for
    /// @param amountIn Amount of token to sell
    /// @param minAmountOut Minimum amount of collateral to receive for the swap to not revert
    /// @param args Either the path for Uniswap or the payload for 1Inch
    /// @param swapType Which swap route to take
    struct ParamsSwapType {
        IERC20 inToken;
        address outToken;
        uint256 amountIn;
        uint256 minAmountOut;
        bytes args;
        SwapType swapType;
    }

    /// @notice Params for direct collateral transfer
    /// @param inToken Token to transfer
    /// @param amountIn Amount of token transfer
    struct TransferType {
        IERC20 inToken;
        uint256 amountIn;
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

    // =============================== Events ======================================

    event CoreUpdated(address indexed _core);
    event Recovered(address indexed tokenAddress, address indexed to, uint256 amount);    

    // ============================= Error Messages ================================

    error IncompatibleLengths();
    error InvalidCall();
    error InvalidConditions();
    error InvalidReturnMessage();
    error NotApprovedOrOwner();
    error NotGovernor();
    error NotGovernorOrGuardian();
    error TooSmallAmountOut();
    error ZeroAddress();

    // =============================== Mappings ====================================

    /// @notice Whether the token was already approved on Uniswap router
    mapping(IERC20 => bool) public uniAllowedToken;
    /// @notice Whether the token was already approved on 1Inch
    mapping(IERC20 => bool) public oneInchAllowedToken;

    // =============================== References ==================================

    /// @notice Core Borrow address
    ICoreBorrow public core;
    /// @notice Address of the Uniswap V3 router potentially used for swaps
    IUniswapV3Router public uniswapV3Router;
    /// @notice Address of the 1Inch router potentially used for swaps
    address public oneInch;

    uint256[45] private __gap;

    constructor() initializer {}

    /// @notice Deploys the `AngleRouter` contract on a chain
    /// @param _core CoreBorrow contract address
    function initialize(
        address _core
    ) public initializer {
        if (_core != address(0)) revert ZeroAddress(); 
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

    /// @notice Supports recovering any tokens as the router does not own any other tokens than
    /// the one mistakenly sent
    /// @param tokenAddress Address of the token to transfer
    /// @param to Address to give tokens to
    /// @param tokenAmount Amount of tokens to transfer
    /// @dev If tokens are mistakenly sent to this contract, any address can take advantage of the `mixer` function
    /// below to get the funds back
    function recoverERC20(
        address tokenAddress,
        address to,
        uint256 tokenAmount
    ) external onlyGovernorOrGuardian {
        IERC20(tokenAddress).safeTransfer(to, tokenAmount);
        emit Recovered(tokenAddress, to, tokenAmount);
    }

    // =========================== Router Functionalities =========================

    /// @notice Wrapper n°1 built on top of the _claimRewards function
    /// Allows to claim rewards for multiple gauges and perpetuals at once
    /// @param gaugeUser Address for which to fetch the rewards from the gauges
    /// @param liquidityGauges Gauges to claim on
    /// @dev If the caller wants to send the rewards to another account it first needs to
    /// call `set_rewards_receiver(otherAccount)` on each `liquidityGauge`
    function claimRewards(
        address gaugeUser,
        address[] memory liquidityGauges
    ) external {
        _claimRewards(gaugeUser, liquidityGauges);
    }

    /// @notice Allows composable calls to different functions within the protocol
    /// @param paramsPermit Array of params `PermitType` used to do a 1 tx to approve the router on each token (can be done once by
    /// setting high approved amounts) which supports the `permit` standard. Users willing to interact with the contract
    /// with tokens that do not support permit should approve the contract for these tokens prior to interacting with it
    /// @param paramsSwap Array of params `ParamsSwapType` used to swap tokens, or to transfer tokens to the router
    /// @param actions List of actions to be performed by the router (in order of execution): make sure to read for each action the
    /// associated internal function
    /// @param data Array of encoded data for each of the actions performed in this mixer. This is where the bytes-encoded parameters
    /// for a given action are stored
    /// @dev This function first fills the router balances via transfers and swaps. It then proceeds with each
    /// action in the order at which they are given
    /// @dev With this function, users can specify paths to swap tokens to the desired token of their choice. Yet the protocol
    /// does not verify the payload given and cannot check that the swap performed by users actually gives the desired
    /// out token: in this case funds will be lost by the user
    /// @dev For some actions, users may be required to give a proportion of the amount of token they have brought to the router within the transaction (through
    /// a direct transfer or a swap) they want to use for the operation. If you want to use all the USDC you have brought (through an ETH -> USDC)
    /// swap to mint stablecoins for instance, you should use `BASE_PARAMS` as a proportion.
    /// @dev The proportion that is specified for an action is a proportion of what is left. If you want to use 50% of your USDC
    /// for an operation and the rest for another, proportion used for the first should be 50% (that is `BASE_PARAMS/2`), and proportion
    /// for the second should be all that is left that is 100% (= `BASE_PARAMS`).
    /// @dev For each action here, make sure to read the documentation of the associated internal function to know how to correctly
    /// specify parameters
    function mixer(
        PermitType[] memory paramsPermit,
        ParamsSwapType[] memory paramsSwap,
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

        // Then, do all the transfer to load all needed funds into the router
        // This function is limited to `_MAX_TOKENS` different assets to be spent on the protocol (agTokens, collaterals)
        address[_MAX_TOKENS] memory listTokens;
        uint256[_MAX_TOKENS] memory balanceTokens;

        for (uint256 i = 0; i < paramsSwap.length; i++) {
            // Caution here: if the args are not set such that end token is the params `paramsSwap[i].collateral`,
            // then the funds will be lost, and any user could take advantage of it to fetch the funds
            uint256 amountOut = _transferAndSwap(
                paramsSwap[i].inToken,
                paramsSwap[i].amountIn,
                paramsSwap[i].minAmountOut,
                paramsSwap[i].swapType,
                paramsSwap[i].args
            );
            _addToList(listTokens, balanceTokens, paramsSwap[i].outToken, amountOut);
        }

        // Performing actions one after the others
        for (uint256 i = 0; i < actions.length; i++) {
            // _processAction(actions[i],listTokens, balanceTokens);
            if (actions[i] == ActionType.claimRewards) {
                (
                    address user,
                    address[] memory claimLiquidityGauges
                ) = abi.decode(data[i], (address, address[]));
                _claimRewards(
                    user,
                    claimLiquidityGauges
                );
            } else if (actions[i] == ActionType.gaugeDeposit) {
                (address user, uint256 amount, address stakedToken, address gauge, bool shouldClaimRewards) = abi
                    .decode(data[i], (address, uint256, address, address, bool));

                amount = _computeProportion(amount, listTokens, balanceTokens, stakedToken);
                _gaugeDeposit(user, amount, ILiquidityGauge(gauge), shouldClaimRewards);
            } else if (actions[i] == ActionType.borrower) {
                (
                    address collateral,
                    address stablecoin,
                    address vaultManager,
                    address to,
                    address who,
                    ActionBorrowType[] memory actionsBorrow,
                    bytes[] memory dataBorrow,
                    bytes memory repayData
                ) = abi.decode(
                        data[i],
                        (address, address, address, address, address, ActionBorrowType[], bytes[], bytes)
                    );
                _parseVaultIDs(actionsBorrow, dataBorrow, vaultManager);
                _changeAllowance(IERC20(collateral), address(vaultManager), type(uint256).max);
                uint256 stablecoinBalance;
                uint256 collateralBalance;
                // In this case, this may mean that the `VaultManager` will engage in some way in a swap of stablecoins
                // or collateral and we should not trust the amounts outputted by the `_angleBorrower` function as the true amounts
                if (repayData.length > 0) {
                    stablecoinBalance = IERC20(stablecoin).balanceOf(address(this));
                    collateralBalance = IERC20(collateral).balanceOf(address(this));
                }

                PaymentData memory paymentData = _angleBorrower(
                    vaultManager,
                    actionsBorrow,
                    dataBorrow,
                    to,
                    who,
                    repayData
                );

                _changeAllowance(IERC20(collateral), address(vaultManager), 0);

                if (repayData.length > 0) {
                    paymentData.collateralAmountToGive = IERC20(collateral).balanceOf(address(this));
                    paymentData.stablecoinAmountToGive = IERC20(stablecoin).balanceOf(address(this));
                    paymentData.collateralAmountToReceive = collateralBalance;
                    paymentData.stablecoinAmountToReceive = stablecoinBalance;
                }

                // Handle collateral transfers
                if (paymentData.collateralAmountToReceive > paymentData.collateralAmountToGive) {
                    uint256 index = _searchList(listTokens, collateral);
                    balanceTokens[index] -= paymentData.collateralAmountToReceive - paymentData.collateralAmountToGive;
                } else if (
                    paymentData.collateralAmountToReceive < paymentData.collateralAmountToGive &&
                    (to == address(this) || repayData.length > 0)
                ) {
                    _addToList(
                        listTokens,
                        balanceTokens,
                        collateral,
                        paymentData.collateralAmountToGive - paymentData.collateralAmountToReceive
                    );
                }
                // Handle stablecoins transfers: the `VaultManager` is called with the `from` address being the `msg.sender`
                // so we don't need to update the stablecoin balance if stablecoins are given to it from this operation as
                // the `VaultManager` will call `burnFrom` and will just check that the router has allowance for the `msg.sender`
                if (
                    paymentData.stablecoinAmountToReceive < paymentData.stablecoinAmountToGive &&
                    (to == address(this) || repayData.length > 0)
                ) {
                    _addToList(
                        listTokens,
                        balanceTokens,
                        stablecoin,
                        paymentData.stablecoinAmountToGive - paymentData.stablecoinAmountToReceive
                    );
                }
            } else if (actions[i] == ActionType.swapIn) {
                (address canonicalToken, address bridgeToken, uint256 amount, address to) = abi
                    .decode(data[i], (address, address, uint256, address));
                uint256 index = _searchList(listTokens, bridgeToken);
                balanceTokens[index] -= amount;
                amount = _swapIn(canonicalToken, bridgeToken, amount, to);
                _addToList(listTokens, balanceTokens, canonicalToken, amount);
            } else if (actions[i] == ActionType.swapOut) {
                (address canonicalToken, address bridgeToken, uint256 amount, address to) = abi
                    .decode(data[i], (address, address, uint256, address));
                uint256 index = _searchList(listTokens, canonicalToken);
                balanceTokens[index] -= amount;
                amount = _swapOut(canonicalToken, bridgeToken, amount, to);
                _addToList(listTokens, balanceTokens, bridgeToken, amount);
            }
        }

        // Once all actions have been performed, the router sends back the unused funds from users
        // If a user sends funds (through a swap) but specifies incorrectly the collateral associated to it, then
        //  the mixer will revert when trying to send the remaining funds back
        for (uint256 i = 0; i < balanceTokens.length; i++) {
            if (balanceTokens[i] > 0) IERC20(listTokens[i]).safeTransfer(msg.sender, balanceTokens[i]);
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
        ParamsSwapType[] memory paramsSwap,
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
        mixer(paramsPermit, paramsSwap, actions, data);
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

    // ======================== Internal Utility Functions =========================
    // Most internal utility functions have a wrapper built on top of it
    /*
    function _processAction(ActionType action, address[] memory listTokens, uint256[] memory balanceTokens) internal returns (address[] memory, uint256[] memory) {


    }
    */

    /// @notice Internal version of the `claimRewards` function
    /// Allows to claim rewards for multiple gauges and perpetuals at once
    /// @param gaugeUser Address for which to fetch the rewards from the gauges
    /// @param liquidityGauges Gauges to claim on
    /// @dev If the caller wants to send the rewards to another account than `gaugeUser` it first needs to
    /// call `set_rewards_receiver(otherAccount)` on each `liquidityGauge`
    function _claimRewards(
        address gaugeUser,
        address[] memory liquidityGauges
    ) internal {
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
    /// @param repayData Bytes to use at the discretion of the msg.sender
    function _angleBorrower(
        address vaultManager,
        ActionBorrowType[] memory actionsBorrow,
        bytes[] memory dataBorrow,
        address to,
        address who,
        bytes memory repayData
    ) internal returns (PaymentData memory paymentData) {
        return IVaultManagerFunctions(vaultManager).angle(actionsBorrow, dataBorrow, msg.sender, to, who, repayData);
    }

    /// @notice Internal version of the `gaugeDeposit` function
    /// Allows to deposit tokens into a gauge
    /// @param user Address on behalf of which deposit should be made in the gauge
    /// @param amount Amount to stake
    /// @param gauge LiquidityGauge to stake in
    /// @param shouldClaimRewards Whether to claim or not previously accumulated rewards
    /// @dev You should be cautious on who will receive the rewards (if `shouldClaimRewards` is true)
    /// It can be set on each gauge
    /// @dev The function will revert if the gauge has not already been approved by the contract
    function _gaugeDeposit(
        address user,
        uint256 amount,
        ILiquidityGauge gauge,
        bool shouldClaimRewards
    ) internal {
        gauge.deposit(amount, user, shouldClaimRewards);
    }

    function _swapIn(address canonicalToken, address bridgeToken, uint256 amount, address to) internal returns(uint256) {
        return IAgTokenMultiChain(canonicalToken).swapIn(bridgeToken, amount, to);
    }

    function _swapOut(address canonicalToken, address bridgeToken, uint256 amount, address to) internal returns(uint256) {
        return IAgTokenMultiChain(canonicalToken).swapOut(bridgeToken, amount, to);
    }

    // ======================== Internal Utility Functions =========================

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
        if (actionsBorrow.length >= _MAX_TOKENS) revert IncompatibleLengths();
        // The amount of vaults to check cannot be bigger than the maximum amount of tokens
        // supported
        uint256[_MAX_TOKENS] memory vaultIDsToCheckOwnershipOf;
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

    /// @notice Checks if collateral in the list
    /// @param list List of addresses
    /// @param searchFor Address of interest
    /// @return index Place of the address in the list if it is in or current length otherwise
    function _searchList(address[_MAX_TOKENS] memory list, address searchFor) internal pure returns (uint256 index) {
        uint256 i;
        while (i < list.length && list[i] != address(0)) {
            if (list[i] == searchFor) return i;
            i++;
        }
        return i;
    }

    /// @notice Modifies stored balances for a given collateral
    /// @param list List of collateral addresses
    /// @param balances List of balances for the different supported collateral types
    /// @param searchFor Address of the collateral of interest
    /// @param amount Amount to add in the balance for this collateral
    function _addToList(
        address[_MAX_TOKENS] memory list,
        uint256[_MAX_TOKENS] memory balances,
        address searchFor,
        uint256 amount
    ) internal pure {
        uint256 index = _searchList(list, searchFor);
        // add it to the list if non existent and we add tokens
        if (list[index] == address(0)) list[index] = searchFor;
        balances[index] += amount;
    }

    /// @notice Computes the proportion of the collateral leftover balance to use for a given action
    /// @param proportion Ratio to take from balance
    /// @param list Collateral list
    /// @param balances Balances of each collateral asset in the collateral list
    /// @param searchFor Collateral to look for
    /// @return amount Amount to use for the action (based on the proportion given)
    /// @dev To use all the collateral balance available for an action, users should give `proportion` a value of
    /// `BASE_PARAMS`
    function _computeProportion(
        uint256 proportion,
        address[_MAX_TOKENS] memory list,
        uint256[_MAX_TOKENS] memory balances,
        address searchFor
    ) internal pure returns (uint256 amount) {
        uint256 index = _searchList(list, searchFor);

        // Reverts if the index was not found
        if (list[index] == address(0)) revert InvalidConditions();

        amount = (proportion * balances[index]) / BASE_PARAMS;
        balances[index] -= amount;
    }

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

    /// @notice Transfers collateral or an arbitrary token which is then swapped on UniswapV3 or on 1Inch
    /// @param inToken Token to swap for the collateral
    /// @param amount Amount of in token to swap for the collateral
    /// @param minAmountOut Minimum amount accepted for the swap to happen
    /// @param swapType Choice on which contracts to swap
    /// @param args Bytes representing either the path to swap your input token to the accepted collateral on Uniswap or payload for 1Inch
    /// @dev The `path` provided is not checked, meaning people could swap for a token A and declare that they've swapped for another token B.
    /// However, the mixer manipulates its token balance only through the addresses registered in `listTokens`, so any subsequent mixer action
    /// trying to transfer funds B will do it through address of token A and revert as A is not actually funded.
    /// In case there is not subsequent action, `mixer` will revert when trying to send back what appears to be remaining tokens A.
    function _transferAndSwap(
        IERC20 inToken,
        uint256 amount,
        uint256 minAmountOut,
        SwapType swapType,
        bytes memory args
    ) internal virtual returns (uint256) {
        inToken.safeTransferFrom(msg.sender, address(this), amount);
        if (swapType == SwapType.None) return amount;
        else return _swap(inToken, amount, minAmountOut, swapType, args);
    }

    /// @notice swap an amount of inToken
    /// @param inToken Token to swap for the collateral
    /// @param amount Amount of in token to swap for the collateral
    /// @param minAmountOut Minimum amount accepted for the swap to happen
    /// @param swapType Choice on which contracts to swap
    function _swap(
        IERC20 inToken,
        uint256 amount,
        uint256 minAmountOut,
        SwapType swapType,
        bytes memory args
    ) internal virtual returns (uint256 amountOut) {}

    /// @notice Allows to swap any token to an accepted collateral via UniswapV3 (if there is a path)
    /// @param inToken Address token used as entrance of the swap
    /// @param amount Amount of in token to swap for the accepted collateral
    /// @param minAmountOut Minimum amount accepted for the swap to happen
    /// @param path Bytes representing the path to swap your input token to the accepted collateral
    function _swapOnUniswapV3(
        IERC20 inToken,
        uint256 amount,
        uint256 minAmountOut,
        bytes memory path
    ) internal returns (uint256 amountOut) {
        // Approve transfer to the `uniswapV3Router` if it is the first time that the token is used
        if (!uniAllowedToken[inToken]) {
            inToken.safeApprove(address(uniswapV3Router), type(uint256).max);
            uniAllowedToken[inToken] = true;
        }
        amountOut = uniswapV3Router.exactInput(
            ExactInputParams(path, address(this), block.timestamp, amount, minAmountOut)
        );
    }

    /// @notice Allows to swap any token to an accepted collateral via 1Inch Router
    /// @param payload Bytes needed for 1Inch router to process the swap
    /// @dev The `payload` given is expected to be obtained from 1Inch API
    function _swapOn1Inch(
        IERC20 inToken,
        bytes memory payload
    ) internal returns (uint256 amountOut) {
        // Approve transfer to the `oneInch` router if it is the first time the token is used
        if (!oneInchAllowedToken[inToken]) {
            inToken.safeApprove(address(oneInch), type(uint256).max);
            oneInchAllowedToken[inToken] = true;
        }

        //solhint-disable-next-line
        (bool success, bytes memory result) = oneInch.call(payload);
        if (!success) _revertBytes(result);

        amountOut = abi.decode(result, (uint256));
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
