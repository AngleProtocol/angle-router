// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.12;

import "../interfaces/IAgToken.sol";
import "../interfaces/IStableMasterFront.sol";
import "../interfaces/ITreasury.sol";
// OpenZeppelin may update its version of the ERC20PermitUpgradeable token
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title AgToken
/// @author Angle Core Team
/// @notice Base contract for agToken, that is to say Angle's stablecoins
/// @dev This contract is used to create and handle the stablecoins of Angle protocol
/// @dev It is still possible for any address to burn its agTokens without redeeming collateral in exchange
/// @dev This contract is the upgraded version of the AgToken that was first deployed on Ethereum mainnet
contract MockAgToken is IAgToken, ERC20PermitUpgradeable {
    using SafeERC20 for IERC20;
    // ========================= References to other contracts =====================

    /// @notice Reference to the `StableMaster` contract associated to this `AgToken`
    address public override stableMaster;
    uint256 public inFees;
    uint256 public outFees;
    uint256 public constant BASE_PARAMS = 10**9;

    // ============================= Constructor ===================================

    /// @notice Initializes the `AgToken` contract
    /// @param name_ Name of the token
    /// @param symbol_ Symbol of the token
    /// @param stableMaster_ Reference to the `StableMaster` contract associated to this agToken
    /// @dev By default, agTokens are ERC-20 tokens with 18 decimals
    function initialize(
        string memory name_,
        string memory symbol_,
        address stableMaster_,
        ITreasury _treasury
    ) external initializer {
        __ERC20Permit_init(name_);
        __ERC20_init(name_, symbol_);
        stableMaster = stableMaster_;
        treasury = _treasury;
        isMinter[stableMaster] = true;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() initializer {}

    // ======= Added Parameters and Variables from the first implementation ========

    mapping(address => bool) public isMinter;
    /// @notice Reference to the treasury contract which can grant minting rights
    ITreasury public treasury;

    // =============================== Added Events ================================

    event TreasuryUpdated(address indexed _treasury);
    event MinterToggled(address indexed minter);

    // =============================== Modifiers ===================================

    /// @notice Checks to see if it is the `StableMaster` calling this contract
    /// @dev There is no Access Control here, because it can be handled cheaply through this modifier
    modifier onlyTreasury() {
        require(msg.sender == address(treasury), "1");
        _;
    }

    /// @notice Checks whether the sender has the minting right
    modifier onlyMinter() {
        require(isMinter[msg.sender], "35");
        _;
    }

    // ========================= External Functions ================================
    // The following functions allow anyone to burn stablecoins without redeeming collateral
    // in exchange for that

    /// @notice Destroys `amount` token from the caller without giving collateral back
    /// @param amount Amount to burn
    /// @param poolManager Reference to the `PoolManager` contract for which the `stocksUsers` will
    /// need to be updated
    /// @dev When calling this function, people should specify the `poolManager` for which they want to decrease
    /// the `stocksUsers`: this a way for the protocol to maintain healthy accounting variables
    function burnNoRedeem(uint256 amount, address poolManager) external {
        _burn(msg.sender, amount);
        IStableMasterFront(stableMaster).updateStocksUsers(amount, poolManager);
    }

    /// @notice Burns `amount` of agToken on behalf of another account without redeeming collateral back
    /// @param account Account to burn on behalf of
    /// @param amount Amount to burn
    /// @param poolManager Reference to the `PoolManager` contract for which the `stocksUsers` will need to be updated
    function burnFromNoRedeem(
        address account,
        uint256 amount,
        address poolManager
    ) external {
        _burnFromNoRedeem(amount, account, msg.sender);
        IStableMasterFront(stableMaster).updateStocksUsers(amount, poolManager);
    }

    /// @notice Allows anyone to burn agToken without redeeming collateral back
    /// @param amount Amount of stablecoins to burn
    /// @dev This function can typically be called if there is a settlement mechanism to burn stablecoins
    function burnStablecoin(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    // ======================= Minter Role Only Functions ==========================

    /// @inheritdoc IAgToken
    function burnSelf(uint256 amount, address burner) external override {
        _burn(burner, amount);
    }

    /// @inheritdoc IAgToken
    function burnFrom(
        uint256 amount,
        address burner,
        address sender
    ) external override onlyMinter {
        _burnFromNoRedeem(amount, burner, sender);
    }

    /// @inheritdoc IAgToken
    function mint(address account, uint256 amount) external override {
        _mint(account, amount);
    }

    // ======================= Treasury Only Functions =============================

    function addMinter(address minter) external {
        isMinter[minter] = true;
        emit MinterToggled(minter);
    }

    function removeMinter(address minter) external {
        // The `treasury` contract cannot remove the `stableMaster`
        require((msg.sender == address(treasury) && minter != stableMaster) || msg.sender == minter, "36");
        isMinter[minter] = false;
        emit MinterToggled(minter);
    }

    function setTreasury(address _treasury) external onlyTreasury {
        treasury = ITreasury(_treasury);
        emit TreasuryUpdated(_treasury);
    }

    // ============================ Internal Function ==============================

    /// @notice Internal version of the function `burnFromNoRedeem`
    /// @param amount Amount to burn
    /// @dev It is at the level of this function that allowance checks are performed
    function _burnFromNoRedeem(
        uint256 amount,
        address burner,
        address sender
    ) internal {
        if (burner != sender) {
            uint256 currentAllowance = allowance(burner, sender);
            require(currentAllowance >= amount, "23");
            _approve(burner, sender, currentAllowance - amount);
        }
        _burn(burner, amount);
    }

    function swapIn(
        address bridgeToken,
        uint256 amount,
        address to
    ) external returns (uint256) {
        IERC20(bridgeToken).safeTransferFrom(msg.sender, address(this), amount);
        uint256 canonicalOut = (amount * (BASE_PARAMS - inFees)) / BASE_PARAMS;
        _mint(to, canonicalOut);
        return canonicalOut;
    }

    function swapOut(
        address bridgeToken,
        uint256 amount,
        address to
    ) external returns (uint256) {
        _burn(msg.sender, amount);
        uint256 bridgeOut = (amount * (BASE_PARAMS - outFees)) / BASE_PARAMS;

        IERC20(bridgeToken).safeTransfer(to, bridgeOut);
        return bridgeOut;
    }

    function setFees(uint256 _inFees, uint256 _outFees) external {
        inFees = _inFees;
        outFees = _outFees;
    }
}
