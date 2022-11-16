// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.12;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "./interfaces/external/IWETH9.sol";
import "./interfaces/external/lido/ISteth.sol";
import "./interfaces/external/lido/IWStETH.sol";

import "./interfaces/IFeeDistributor.sol";
import "./interfaces/ISanToken.sol";
import "./interfaces/IStableMaster.sol";
import "./interfaces/IStableMasterFront.sol";
import "./interfaces/IVeANGLE.sol";

import "./BaseRouter.sol";

// ============================= STRUCTS AND ENUMS =============================

/// @notice References to the contracts associated to a collateral for a stablecoin
struct Pairs {
    IPoolManager poolManager;
    IPerpetualManagerFrontWithClaim perpetualManager;
    ISanToken sanToken;
    ILiquidityGauge gauge;
}

/// @title Angle Router
/// @author Angle Core Team
/// @notice The `AngleRouter` contract facilitates interactions for users with the protocol. It was built to reduce the number
/// of approvals required to users and the number of transactions needed to perform some complex actions: like deposit and stake
/// in just one transaction
/// @dev Interfaces were designed for both advanced users which know the addresses of the protocol's contract, but most of the time
/// users which only know addresses of the stablecoins and collateral types of the protocol can perform the actions they want without
/// needing to understand what's happening under the hood
contract AngleRouter is BaseRouter, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    /// @notice Wrapped ETH contract
    IWETH9 public constant WETH9 = IWETH9(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    /// @notice ANGLE contract
    IERC20 public constant ANGLE = IERC20(0x31429d1856aD1377A8A0079410B297e1a9e214c2);
    /// @notice veANGLE contract
    IVeANGLE public constant VEANGLE = IVeANGLE(0x0C462Dbb9EC8cD1630f1728B2CFD2769d09f0dd5);
    /// @notice StETH contract
    IStETH public constant STETH = IStETH(0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84);
    /// @notice Wrapped StETH contract
    IWStETH public constant WSTETH = IWStETH(0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0);

    // =================================== EVENTS ==================================

    event AdminChanged(address indexed admin, bool setGovernor);
    event StablecoinAdded(address indexed stableMaster);
    event StablecoinRemoved(address indexed stableMaster);
    event CollateralToggled(address indexed stableMaster, address indexed poolManager, address indexed liquidityGauge);
    event SanTokenLiquidityGaugeUpdated(address indexed sanToken, address indexed newLiquidityGauge);
    event Recovered(address indexed tokenAddress, address indexed to, uint256 amount);

    // =================================== ERRORS ==================================

    error AlreadyAdded();
    error InvalidAddress();
    error InvalidToken();

    // ================================== MAPPINGS =================================

    /// @notice Maps an agToken to its counterpart `StableMaster`
    mapping(IERC20 => IStableMasterFront) public mapStableMasters;
    /// @notice Maps a `StableMaster` to a mapping of collateral token to its counterpart `PoolManager`
    mapping(IStableMasterFront => mapping(IERC20 => Pairs)) public mapPoolManagers;
    /// @notice Whether the token was already approved on Uniswap router
    mapping(IERC20 => bool) public uniAllowedToken;
    /// @notice Whether the token was already approved on 1Inch
    mapping(IERC20 => bool) public oneInchAllowedToken;

    // ================================= REFERENCES ================================

    /// @notice Governor address
    address public governor;
    /// @notice Guardian address
    address public guardian;
    /// @notice Address of the router used for swaps
    IUniswapV3Router public uniswapV3Router;
    /// @notice Address of 1Inch router used for swaps
    address public oneInch;

    uint256[50] private __gap;

    /// @dev We Removed the `initialize` function in this implementation since it has already been called
    /// and can not be called again. You can check it for context at the end of this contract
    constructor() initializer {}

    // =========================== ROUTER FUNCTIONALITIES ==========================

    /// @inheritdoc BaseRouter
    function _chainSpecificAction(ActionType action, bytes memory data) internal override {
        if (action == ActionType.claimRewardsWithPerps) {
            (
                address user,
                uint256 proportionToBeTransferred,
                address[] memory claimLiquidityGauges,
                uint256[] memory claimPerpetualIDs,
                bool addressProcessed,
                address[] memory stablecoins,
                address[] memory collateralsOrPerpetualManagers
            ) = abi.decode(data, (address, uint256, address[], uint256[], bool, address[], address[]));

            uint256 amount = ANGLE.balanceOf(user);

            _claimRewardsWithPerps(
                user,
                claimLiquidityGauges,
                claimPerpetualIDs,
                addressProcessed,
                stablecoins,
                collateralsOrPerpetualManagers
            );
            if (proportionToBeTransferred > 0) {
                amount = ANGLE.balanceOf(user) - amount;
                amount = (amount * proportionToBeTransferred) / 10**9;
                ANGLE.safeTransferFrom(msg.sender, address(this), amount);
            }
        } else if (action == ActionType.claimWeeklyInterest) {
            (address user, address feeDistributor, bool letInContract) = abi.decode(data, (address, address, bool));
            _claimWeeklyInterest(user, IFeeDistributorFront(feeDistributor), letInContract);
        } else if (action == ActionType.veANGLEDeposit) {
            (address user, uint256 amount) = abi.decode(data, (address, uint256));
            _depositOnLocker(user, amount);
        } else if (action == ActionType.gaugeDeposit) {
            (address user, uint256 amount, address stakedToken, address gauge, bool shouldClaimRewards) = abi.decode(
                data,
                (address, uint256, address, address, bool)
            );
            if (amount == type(uint256).max) amount = IERC20(stakedToken).balanceOf(address(this));
            _gaugeDeposit(user, amount, ILiquidityGauge(gauge), shouldClaimRewards);
        } else if (action == ActionType.deposit) {
            (
                address user,
                uint256 amount,
                bool addressProcessed,
                address stablecoinOrStableMaster,
                address collateral,
                address poolManager,
                address sanToken
            ) = abi.decode(data, (address, uint256, bool, address, address, address, address));
            _deposit(
                user,
                amount,
                addressProcessed,
                stablecoinOrStableMaster,
                collateral,
                IPoolManager(poolManager),
                ISanToken(sanToken)
            );
        } else if (action == ActionType.withdraw) {
            (
                uint256 amount,
                bool addressProcessed,
                address stablecoinOrStableMaster,
                address collateralOrPoolManager,
                address sanToken
            ) = abi.decode(data, (uint256, bool, address, address, address));
            if (amount == type(uint256).max) amount = IERC20(sanToken).balanceOf(address(this));
            // Reusing the `collateralOrPoolManager` variable to save some variable declarations
            _withdraw(amount, addressProcessed, stablecoinOrStableMaster, collateralOrPoolManager);
        } else if (action == ActionType.mint) {
            (
                address user,
                uint256 amount,
                uint256 minStableAmount,
                bool addressProcessed,
                address stablecoinOrStableMaster,
                address collateral,
                address poolManager
            ) = abi.decode(data, (address, uint256, uint256, bool, address, address, address));
            _mint(
                user,
                amount,
                minStableAmount,
                addressProcessed,
                stablecoinOrStableMaster,
                collateral,
                IPoolManager(poolManager)
            );
        } else if (action == ActionType.openPerpetual) {
            (
                address user,
                uint256 amount,
                uint256 amountCommitted,
                uint256 extremeRateOracle,
                uint256 minNetMargin,
                bool addressProcessed,
                address stablecoinOrPerpetualManager,
                address collateral
            ) = abi.decode(data, (address, uint256, uint256, uint256, uint256, bool, address, address));
            _openPerpetual(
                user,
                amount,
                amountCommitted,
                extremeRateOracle,
                minNetMargin,
                addressProcessed,
                stablecoinOrPerpetualManager,
                collateral
            );
        } else if (action == ActionType.addToPerpetual) {
            (
                uint256 amount,
                uint256 perpetualID,
                bool addressProcessed,
                address stablecoinOrPerpetualManager,
                address collateral
            ) = abi.decode(data, (uint256, uint256, bool, address, address));
            _addToPerpetual(amount, perpetualID, addressProcessed, stablecoinOrPerpetualManager, collateral);
        } else if (action == ActionType.wrapMultiple) {
            uint256 minAmountOut = abi.decode(data, (uint256));
            _wrapMultiple(minAmountOut);
        }
    }

    /// @inheritdoc BaseRouter
    function _get1InchRouter() internal view override returns (address) {
        return oneInch;
    }

    /// @inheritdoc BaseRouter
    function _getUniswapRouter() internal view override returns (IUniswapV3Router) {
        return uniswapV3Router;
    }

    /// @inheritdoc BaseRouter
    function _getNativeWrapper() internal pure override returns (IWETH9) {
        return WETH9;
    }

    /// @inheritdoc BaseRouter
    function _wrap(uint256 amount, uint256 minAmountOut) internal override returns (uint256 amountOut) {
        amountOut = WSTETH.wrap(amount);
        _slippageCheck(amountOut, minAmountOut);
    }

    /// @inheritdoc BaseRouter
    function _unwrap(
        uint256 amount,
        uint256 minAmountOut,
        address to
    ) internal override returns (uint256 amountOut) {
        amountOut = WSTETH.unwrap(amount);
        _slippageCheck(amountOut, minAmountOut);
        if (to != address(0)) IERC20(address(STETH)).safeTransfer(to, amountOut);
    }

    /// @notice Wraps ETH directly to wstETH in one transaction
    function _wrapMultiple(uint256 minAmountOut) internal {
        uint256 amountOut = STETH.getSharesByPooledEth(msg.value);
        _slippageCheck(amountOut, minAmountOut);
        //solhint-disable-next-line
        (bool success, bytes memory result) = address(WSTETH).call{ value: msg.value }("");
        if (!success) _revertBytes(result);
    }

    /// @notice Internal version of the `claimRewards` function
    /// Allows to claim rewards for multiple gauges and perpetuals at once
    /// @param gaugeUser Address for which to fetch the rewards from the gauges
    /// @param liquidityGauges Gauges to claim on
    /// @param perpetualIDs Perpetual IDs to claim rewards for
    /// @param addressProcessed Whether `PerpetualManager` list is already accessible in `collateralsOrPerpetualManagers`vor if it should be
    /// retrieved from `stablecoins` and `collateralsOrPerpetualManagers`
    /// @param stablecoins Stablecoin contracts linked to the perpetualsIDs. Array of zero addresses if addressProcessed is true
    /// @param collateralsOrPerpetualManagers Collateral contracts linked to the perpetualsIDs or `perpetualManager` contracts if
    /// `addressProcessed` is true
    /// @dev If the caller wants to send the rewards to another account than `gaugeUser` it first needs to
    /// call `set_rewards_receiver(otherAccount)` on each `liquidityGauge`
    /// @dev The function only takes rewards received by users
    function _claimRewardsWithPerps(
        address gaugeUser,
        address[] memory liquidityGauges,
        uint256[] memory perpetualIDs,
        bool addressProcessed,
        address[] memory stablecoins,
        address[] memory collateralsOrPerpetualManagers
    ) internal {
        if (stablecoins.length != perpetualIDs.length || collateralsOrPerpetualManagers.length != perpetualIDs.length)
            revert IncompatibleLengths();

        for (uint256 i = 0; i < liquidityGauges.length; i++) {
            ILiquidityGauge(liquidityGauges[i]).claim_rewards(gaugeUser);
        }

        for (uint256 i = 0; i < perpetualIDs.length; i++) {
            IPerpetualManagerFrontWithClaim perpManager;
            if (addressProcessed) perpManager = IPerpetualManagerFrontWithClaim(collateralsOrPerpetualManagers[i]);
            else {
                (, Pairs memory pairs) = _getInternalContracts(
                    IERC20(stablecoins[i]),
                    IERC20(collateralsOrPerpetualManagers[i])
                );
                perpManager = pairs.perpetualManager;
            }
            perpManager.getReward(perpetualIDs[i]);
        }
    }

    /// @notice Allows to deposit ANGLE on an existing locker
    /// @param user Address to deposit for
    /// @param amount Amount to deposit
    function _depositOnLocker(address user, uint256 amount) internal {
        VEANGLE.deposit_for(user, amount);
    }

    /// @notice Allows to claim weekly interest distribution and if wanted to transfer it to the `angleRouter` for future use
    /// @param user Address to claim for
    /// @param _feeDistributor Address of the fee distributor to claim to
    /// @dev If funds are transferred to the router, this action cannot be an end in itself, otherwise funds will be lost:
    /// typically we expect people to call for this action before doing a deposit
    /// @dev If `letInContract` (and hence if funds are transferred to the router), you should approve the `angleRouter` to
    /// transfer the token claimed from the `feeDistributor`
    function _claimWeeklyInterest(
        address user,
        IFeeDistributorFront _feeDistributor,
        bool letInContract
    ) internal returns (uint256 amount, IERC20 token) {
        amount = _feeDistributor.claim(user);
        if (letInContract) {
            // Fetching info from the `FeeDistributor` to process correctly the withdrawal
            token = IERC20(_feeDistributor.token());
            token.safeTransferFrom(msg.sender, address(this), amount);
        } else {
            amount = 0;
        }
    }

    /// @notice Internal version of the `mint` functions
    /// Mints stablecoins from the protocol
    /// @param user Address to send the stablecoins to
    /// @param amount Amount of collateral to use for the mint
    /// @param minStableAmount Minimum stablecoin minted for the tx not to revert
    /// @param addressProcessed Whether `msg.sender` provided the contracts address or the tokens one
    /// @param stablecoinOrStableMaster Token associated to a `StableMaster` (if `addressProcessed` is false)
    /// or directly the `StableMaster` contract if `addressProcessed`
    /// @param collateral Collateral to mint from: it can be null if `addressProcessed` is true but in the corresponding
    /// action, the `mixer` needs to get a correct address to compute the amount of tokens to use for the mint
    /// @param poolManager PoolManager associated to the `collateral` (null if `addressProcessed` is not true)
    /// @dev This function is not designed to be composable with other actions of the router after it's called: like
    /// stablecoins obtained from it cannot be used for other operations: as such the `user` address should not be the router
    /// address
    function _mint(
        address user,
        uint256 amount,
        uint256 minStableAmount,
        bool addressProcessed,
        address stablecoinOrStableMaster,
        address collateral,
        IPoolManager poolManager
    ) internal {
        IStableMasterFront stableMaster;
        (stableMaster, poolManager) = _mintBurnContracts(
            addressProcessed,
            stablecoinOrStableMaster,
            collateral,
            poolManager
        );
        stableMaster.mint(amount, user, poolManager, minStableAmount);
    }

    /// @notice Internal version of the `deposit` functions
    /// Allows to deposit a collateral within the protocol
    /// @param user Address where to send the resulting sanTokens, if this address is the router address then it means
    /// that the intention is to stake the sanTokens obtained in a subsequent `gaugeDeposit` action
    /// @param amount Amount of collateral to deposit
    /// @param addressProcessed Whether `msg.sender` provided the contracts addresses or the tokens ones
    /// @param stablecoinOrStableMaster Token associated to a `StableMaster` (if `addressProcessed` is false)
    /// or directly the `StableMaster` contract if `addressProcessed`
    /// @param collateral Token to deposit: it can be null if `addressProcessed` is true but in the corresponding
    /// action, the `mixer` needs to get a correct address to compute the amount of tokens to use for the deposit
    /// @param poolManager PoolManager associated to the `collateral` (null if `addressProcessed` is not true)
    /// @param sanToken SanToken associated to the `collateral` (null if `addressProcessed` is not true)
    /// @dev Contrary to the `mint` action, the `deposit` action can be used in composition with other actions, like
    /// `deposit` and then `stake`
    function _deposit(
        address user,
        uint256 amount,
        bool addressProcessed,
        address stablecoinOrStableMaster,
        address collateral,
        IPoolManager poolManager,
        ISanToken sanToken
    ) internal returns (uint256 addedAmount, address) {
        IStableMasterFront stableMaster;
        if (addressProcessed) {
            stableMaster = IStableMasterFront(stablecoinOrStableMaster);
        } else {
            Pairs memory pairs;
            (stableMaster, pairs) = _getInternalContracts(IERC20(stablecoinOrStableMaster), IERC20(collateral));
            poolManager = pairs.poolManager;
            sanToken = pairs.sanToken;
        }

        if (user == address(this)) {
            // Computing the amount of sanTokens obtained
            addedAmount = sanToken.balanceOf(address(this));
            stableMaster.deposit(amount, address(this), poolManager);
            addedAmount = sanToken.balanceOf(address(this)) - addedAmount;
        } else {
            stableMaster.deposit(amount, user, poolManager);
        }
        return (addedAmount, address(sanToken));
    }

    /// @notice Withdraws sanTokens from the protocol
    /// @param amount Amount of sanTokens to withdraw
    /// @param addressProcessed Whether `msg.sender` provided the contracts addresses or the tokens ones
    /// @param stablecoinOrStableMaster Token associated to a `StableMaster` (if `addressProcessed` is false)
    /// or directly the `StableMaster` contract if `addressProcessed`
    /// @param collateralOrPoolManager Collateral to withdraw (if `addressProcessed` is false) or directly
    /// the `PoolManager` contract if `addressProcessed`
    function _withdraw(
        uint256 amount,
        bool addressProcessed,
        address stablecoinOrStableMaster,
        address collateralOrPoolManager
    ) internal returns (uint256 withdrawnAmount, address) {
        IStableMasterFront stableMaster;
        // Stores the address of the `poolManager`, while `collateralOrPoolManager` is used in the function
        // to store the `collateral` address
        IPoolManager poolManager;
        if (addressProcessed) {
            stableMaster = IStableMasterFront(stablecoinOrStableMaster);
            poolManager = IPoolManager(collateralOrPoolManager);
            collateralOrPoolManager = poolManager.token();
        } else {
            Pairs memory pairs;
            (stableMaster, pairs) = _getInternalContracts(
                IERC20(stablecoinOrStableMaster),
                IERC20(collateralOrPoolManager)
            );
            poolManager = pairs.poolManager;
        }
        // Here reusing the `withdrawnAmount` variable to avoid a stack too deep problem
        withdrawnAmount = IERC20(collateralOrPoolManager).balanceOf(address(this));

        // This call will increase our collateral balance
        stableMaster.withdraw(amount, address(this), address(this), poolManager);

        // We compute the difference between our collateral balance after and before the `withdraw` call
        withdrawnAmount = IERC20(collateralOrPoolManager).balanceOf(address(this)) - withdrawnAmount;

        return (withdrawnAmount, collateralOrPoolManager);
    }

    /// @notice Internal version of the `openPerpetual` function
    /// Opens a perpetual within Angle
    /// @param owner Address to mint perpetual for
    /// @param margin Margin to open the perpetual with
    /// @param amountCommitted Commit amount in the perpetual
    /// @param maxOracleRate Maximum oracle rate required to have a leverage position opened
    /// @param minNetMargin Minimum net margin required to have a leverage position opened
    /// @param addressProcessed Whether msg.sender provided the contracts addresses or the tokens ones
    /// @param stablecoinOrPerpetualManager Token associated to the `StableMaster` (iif `addressProcessed` is false)
    /// or address of the desired `PerpetualManager` (if `addressProcessed` is true)
    /// @param collateral Collateral to mint from (it can be null if `addressProcessed` is true): it can be null if `addressProcessed` is true but in the corresponding
    /// action, the `mixer` needs to get a correct address to compute the amount of tokens to use for the deposit
    function _openPerpetual(
        address owner,
        uint256 margin,
        uint256 amountCommitted,
        uint256 maxOracleRate,
        uint256 minNetMargin,
        bool addressProcessed,
        address stablecoinOrPerpetualManager,
        address collateral
    ) internal returns (uint256 perpetualID) {
        if (!addressProcessed) {
            (, Pairs memory pairs) = _getInternalContracts(IERC20(stablecoinOrPerpetualManager), IERC20(collateral));
            stablecoinOrPerpetualManager = address(pairs.perpetualManager);
        }
        return
            IPerpetualManagerFrontWithClaim(stablecoinOrPerpetualManager).openPerpetual(
                owner,
                margin,
                amountCommitted,
                maxOracleRate,
                minNetMargin
            );
    }

    /// @notice Internal version of the `addToPerpetual` function
    /// Adds collateral to a perpetual
    /// @param margin Amount of collateral to add
    /// @param perpetualID Perpetual to add collateral to
    /// @param addressProcessed Whether msg.sender provided the contracts addresses or the tokens ones
    /// @param stablecoinOrPerpetualManager Token associated to the `StableMaster` (iif `addressProcessed` is false)
    /// or address of the desired `PerpetualManager` (if `addressProcessed` is true)
    /// @param collateral Collateral to mint from (it can be null if `addressProcessed` is true): it can be null if `addressProcessed` is true but in the corresponding
    /// action, the `mixer` needs to get a correct address to compute the amount of tokens to use for the deposit
    function _addToPerpetual(
        uint256 margin,
        uint256 perpetualID,
        bool addressProcessed,
        address stablecoinOrPerpetualManager,
        address collateral
    ) internal {
        if (!addressProcessed) {
            (, Pairs memory pairs) = _getInternalContracts(IERC20(stablecoinOrPerpetualManager), IERC20(collateral));
            stablecoinOrPerpetualManager = address(pairs.perpetualManager);
        }
        IPerpetualManagerFrontWithClaim(stablecoinOrPerpetualManager).addToPerpetual(perpetualID, margin);
    }

    // ================================== MODIFIER =================================

    /// @notice Checks to see if it is the `governor` or `guardian` calling this contract
    modifier onlyGovernorOrGuardian() {
        if (msg.sender != governor && msg.sender != guardian) revert NotGovernorOrGuardian();
        _;
    }

    // ============================ GOVERNANCE UTILITIES ===========================

    /// @notice Changes the guardian or the governor address
    /// @param admin New guardian or guardian address
    /// @param setGovernor Whether to set Governor if true, or Guardian if false
    /// @dev There can only be one guardian and one governor address in the router
    /// and both need to be different
    function setGovernorOrGuardian(address admin, bool setGovernor) external onlyGovernorOrGuardian {
        if (admin == address(0)) revert ZeroAddress();
        if (guardian == admin || governor == admin) revert InvalidAddress();
        if (setGovernor) governor = admin;
        else guardian = admin;
        emit AdminChanged(admin, setGovernor);
    }

    /// @notice Adds a new `StableMaster`
    /// @param stablecoin Address of the new stablecoin
    /// @param stableMaster Address of the new `StableMaster`
    function addStableMaster(IERC20 stablecoin, IStableMasterFront stableMaster) external onlyGovernorOrGuardian {
        // No need to check if the `stableMaster` address is a zero address as otherwise the call to `stableMaster.agToken()`
        // would revert
        if (address(stablecoin) == address(0)) revert ZeroAddress();
        if (address(mapStableMasters[stablecoin]) != address(0)) revert AlreadyAdded();
        if (stableMaster.agToken() != address(stablecoin)) revert InvalidToken();
        mapStableMasters[stablecoin] = stableMaster;
        emit StablecoinAdded(address(stableMaster));
    }

    /// @notice Adds new collateral types to specific stablecoins
    /// @param stablecoins Addresses of the stablecoins associated to the `StableMaster` of interest
    /// @param poolManagers Addresses of the `PoolManager` contracts associated to the pair (stablecoin,collateral)
    /// @param liquidityGauges Addresses of liquidity gauges contract associated to sanToken
    function addPairs(
        IERC20[] calldata stablecoins,
        IPoolManager[] calldata poolManagers,
        ILiquidityGauge[] calldata liquidityGauges
    ) external onlyGovernorOrGuardian {
        if (poolManagers.length != stablecoins.length || liquidityGauges.length != stablecoins.length)
            revert IncompatibleLengths();
        for (uint256 i = 0; i < stablecoins.length; i++) {
            IStableMasterFront stableMaster = mapStableMasters[stablecoins[i]];
            _addPair(stableMaster, poolManagers[i], liquidityGauges[i]);
        }
    }

    /// @notice Sets new `liquidityGauge` contract for the associated sanTokens
    /// @param stablecoins Addresses of the stablecoins
    /// @param collaterals Addresses of the collaterals
    /// @param newLiquidityGauges Addresses of the new liquidity gauges contract
    /// @dev If `newLiquidityGauge` is null, this means that there is no liquidity gauge for this pair
    /// @dev This function could be used to simply revoke the approval to a liquidity gauge
    function setLiquidityGauges(
        IERC20[] calldata stablecoins,
        IERC20[] calldata collaterals,
        ILiquidityGauge[] calldata newLiquidityGauges
    ) external onlyGovernorOrGuardian {
        if (collaterals.length != stablecoins.length || newLiquidityGauges.length != stablecoins.length)
            revert IncompatibleLengths();
        for (uint256 i = 0; i < stablecoins.length; i++) {
            IStableMasterFront stableMaster = mapStableMasters[stablecoins[i]];
            Pairs storage pairs = mapPoolManagers[stableMaster][collaterals[i]];
            ILiquidityGauge gauge = pairs.gauge;
            ISanToken sanToken = pairs.sanToken;
            if (address(stableMaster) == address(0) || address(pairs.poolManager) == address(0)) revert ZeroAddress();
            pairs.gauge = newLiquidityGauges[i];
            if (address(gauge) != address(0)) {
                sanToken.approve(address(gauge), 0);
            }
            if (address(newLiquidityGauges[i]) != address(0)) {
                // Checking compatibility of the staking token: it should be the sanToken
                if (address(newLiquidityGauges[i].staking_token()) != address(sanToken)) revert InvalidToken();
                sanToken.approve(address(newLiquidityGauges[i]), type(uint256).max);
            }
            emit SanTokenLiquidityGaugeUpdated(address(sanToken), address(newLiquidityGauges[i]));
        }
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

    // ========================= INTERNAL UTILITY FUNCTIONS ========================

    /// @notice Gets Angle contracts associated to a pair (stablecoin, collateral)
    /// @param stablecoin Token associated to a `StableMaster`
    /// @param collateral Collateral to mint/deposit/open perpetual or add collateral from
    /// @dev This function is used to check that the parameters passed by people calling some of the main
    /// router functions are correct
    function _getInternalContracts(IERC20 stablecoin, IERC20 collateral)
        internal
        view
        returns (IStableMasterFront stableMaster, Pairs memory pairs)
    {
        stableMaster = mapStableMasters[stablecoin];
        pairs = mapPoolManagers[stableMaster][collateral];
        // If `stablecoin` is zero then this necessarily means that `stableMaster` here will be 0
        // Similarly, if `collateral` is zero, then this means that `pairs.perpetualManager`, `pairs.poolManager`
        // and `pairs.sanToken` will be zero
        // Last, if any of `pairs.perpetualManager`, `pairs.poolManager` or `pairs.sanToken` is zero, this means
        // that all others should be null from the `addPairs` and `removePairs` functions which keep this invariant
        if (address(stableMaster) == address(0) || address(pairs.poolManager) == address(0)) revert ZeroAddress();

        return (stableMaster, pairs);
    }

    /// @notice Get contracts for mint and burn actions
    /// @param addressProcessed Whether `msg.sender` provided the contracts address or the tokens one
    /// @param stablecoinOrStableMaster Token associated to a `StableMaster` (if `addressProcessed` is false)
    /// or directly the `StableMaster` contract if `addressProcessed`
    /// @param collateral Collateral to mint from: it can be null if `addressProcessed` is true but in the corresponding
    /// action, the `mixer` needs to get a correct address to compute the amount of tokens to use for the mint
    /// @param poolManager PoolManager associated to the `collateral` (null if `addressProcessed` is not true)
    function _mintBurnContracts(
        bool addressProcessed,
        address stablecoinOrStableMaster,
        address collateral,
        IPoolManager poolManager
    ) internal view returns (IStableMasterFront, IPoolManager) {
        IStableMasterFront stableMaster;
        if (addressProcessed) {
            stableMaster = IStableMasterFront(stablecoinOrStableMaster);
        } else {
            Pairs memory pairs;
            (stableMaster, pairs) = _getInternalContracts(IERC20(stablecoinOrStableMaster), IERC20(collateral));
            poolManager = pairs.poolManager;
        }
        return (stableMaster, poolManager);
    }

    /// @notice Adds new collateral type to specific stablecoin
    /// @param stableMaster Address of the `StableMaster` associated to the stablecoin of interest
    /// @param poolManager Address of the `PoolManager` contract associated to the pair (stablecoin,collateral)
    /// @param liquidityGauge Address of liquidity gauge contract associated to sanToken
    function _addPair(
        IStableMasterFront stableMaster,
        IPoolManager poolManager,
        ILiquidityGauge liquidityGauge
    ) internal {
        // Fetching the associated `sanToken` and `perpetualManager` from the contract
        (IERC20 collateral, ISanToken sanToken, IPerpetualManager perpetualManager, , , , , , ) = IStableMaster(
            address(stableMaster)
        ).collateralMap(poolManager);

        Pairs storage _pairs = mapPoolManagers[stableMaster][collateral];
        // Checking if the pair has not already been initialized: if yes we need to make the function revert
        // otherwise we could end up with still approved `PoolManager` and `PerpetualManager` contracts
        if (address(_pairs.poolManager) != address(0)) revert AlreadyAdded();

        _pairs.poolManager = poolManager;
        _pairs.perpetualManager = IPerpetualManagerFrontWithClaim(address(perpetualManager));
        _pairs.sanToken = sanToken;
        // In the future, it is possible that sanTokens do not have an associated liquidity gauge
        if (address(liquidityGauge) != address(0)) {
            if (address(sanToken) != liquidityGauge.staking_token()) revert InvalidToken();
            _pairs.gauge = liquidityGauge;
            sanToken.approve(address(liquidityGauge), type(uint256).max);
        }
        _changeAllowance(collateral, address(stableMaster), type(uint256).max);
        _changeAllowance(collateral, address(perpetualManager), type(uint256).max);
        emit CollateralToggled(address(stableMaster), address(poolManager), address(liquidityGauge));
    }

    /// For context, we give here the initialize function that was used for this contract in another implementation
    // function initialize(
    //     address _governor,
    //     address _guardian,
    //     IUniswapV3Router _uniswapV3Router,
    //     address _oneInch,
    //     IStableMasterFront existingStableMaster,
    //     IPoolManager[] calldata existingPoolManagers,
    //     ILiquidityGauge[] calldata existingLiquidityGauges
    // ) public initializer {
    //     // Checking the parameters passed
    //     require(
    //         address(_uniswapV3Router) != address(0) &&
    //             _oneInch != address(0) &&
    //             _governor != address(0) &&
    //             _guardian != address(0),
    //         "0"
    //     );
    //     require(_governor != _guardian, "49");
    //     require(existingPoolManagers.length == existingLiquidityGauges.length, "104");
    //     // Fetching the stablecoin and mapping it to the `StableMaster`
    //     mapStableMasters[
    //         IERC20(address(IStableMaster(address(existingStableMaster)).agToken()))
    //     ] = existingStableMaster;
    //     // Setting roles
    //     governor = _governor;
    //     guardian = _guardian;
    //     uniswapV3Router = _uniswapV3Router;
    //     oneInch = _oneInch;

    //     // for veANGLEDeposit action
    //     ANGLE.safeApprove(address(VEANGLE), type(uint256).max);

    //     for (uint256 i = 0; i < existingPoolManagers.length; i++) {
    //         _addPair(existingStableMaster, existingPoolManagers[i], existingLiquidityGauges[i]);
    //     }
    // }
}
