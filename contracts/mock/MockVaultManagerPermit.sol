// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

import "../interfaces/IVaultManager.sol";
import "../interfaces/ITreasury.sol";
import "../interfaces/IAgToken.sol";
import "../interfaces/external/IERC1271.sol";

contract MockVaultManagerPermit {
    using Address for address;
    using SafeERC20 for IERC20;

    ITreasury public treasury;
    mapping(uint256 => Vault) public vaultData;
    mapping(uint256 => address) public ownerOf;
    uint256 public surplus;
    uint256 public badDebt;
    uint256 public vaultIDCount;
    IAgToken public stablecoin;
    address public oracle = address(this);

    address public governor;
    IERC20 public collateral;
    uint256 public oracleValue;
    uint256 public interestAccumulator;
    uint256 public collateralFactor;
    uint256 public totalNormalizedDebt;

    /* solhint-disable var-name-mixedcase */
    bytes32 private _HASHED_NAME;
    bytes32 private _HASHED_VERSION;
    bytes32 private _PERMIT_TYPEHASH;
    /* solhint-enable var-name-mixedcase */

    PaymentData public paymentData;

    mapping(address => uint256) private _nonces;
    // Mapping from owner to operator approvals
    mapping(address => mapping(address => uint256)) public operatorApprovals;
    mapping(uint256 => mapping(address => bool)) public approved;
    error ExpiredDeadline();
    error InvalidSignature();

    constructor(string memory _name) {
        _PERMIT_TYPEHASH = keccak256(
            "Permit(address owner,address spender,bool approved,uint256 nonce,uint256 deadline)"
        );
        _HASHED_NAME = keccak256(bytes(_name));
        _HASHED_VERSION = keccak256(bytes("1"));
    }

    function accrueInterestToTreasury() external returns (uint256, uint256) {
        // Avoid the function to be view
        if (surplus >= badDebt) {
            stablecoin.mint(msg.sender, surplus - badDebt);
        }
        return (surplus, badDebt);
    }

    function read() external view returns (uint256) {
        return oracleValue;
    }

    function setParams(
        address _governor,
        address _collateral,
        address _stablecoin,
        uint256 _oracleValue,
        uint256 _interestAccumulator,
        uint256 _collateralFactor,
        uint256 _totalNormalizedDebt
    ) external {
        governor = _governor;
        collateral = IERC20(_collateral);
        stablecoin = IAgToken(_stablecoin);
        interestAccumulator = _interestAccumulator;
        collateralFactor = _collateralFactor;
        totalNormalizedDebt = _totalNormalizedDebt;
        oracleValue = _oracleValue;
    }

    function setOwner(uint256 vaultID, address owner) external {
        ownerOf[vaultID] = owner;
    }

    function setVaultData(
        uint256 normalizedDebt,
        uint256 collateralAmount,
        uint256 vaultID
    ) external {
        vaultData[vaultID].normalizedDebt = normalizedDebt;
        vaultData[vaultID].collateralAmount = collateralAmount;
    }

    function isGovernor(address admin) external view returns (bool) {
        return admin == governor;
    }

    function updateVaultIDCount(uint256 _vaultIDCount) external {
        vaultIDCount = _vaultIDCount;
    }

    function setSurplusBadDebt(
        uint256 _surplus,
        uint256 _badDebt,
        IAgToken _token
    ) external {
        surplus = _surplus;
        badDebt = _badDebt;
        stablecoin = _token;
    }

    function setPaymentData(
        uint256 stablecoinAmountToGive,
        uint256 stablecoinAmountToReceive,
        uint256 collateralAmountToGive,
        uint256 collateralAmountToReceive
    ) external {
        paymentData.stablecoinAmountToGive = stablecoinAmountToGive;
        paymentData.stablecoinAmountToReceive = stablecoinAmountToReceive;
        paymentData.collateralAmountToGive = collateralAmountToGive;
        paymentData.collateralAmountToReceive = collateralAmountToReceive;
    }

    function getDebtOut(
        uint256 vaultID,
        uint256 amountStablecoins,
        uint256 senderBorrowFee
    ) external {}

    function setTreasury(address _treasury) external {
        treasury = ITreasury(_treasury);
    }

    function getVaultDebt(uint256 vaultID) external view returns (uint256) {
        vaultID;
        stablecoin;
        return 0;
    }

    function createVault(address toVault) external view returns (uint256) {
        toVault;
        stablecoin;
        return 0;
    }

    function angle(
        ActionBorrowType[] memory actions,
        bytes[] memory datas,
        address from,
        address to,
        address who,
        bytes memory repayData
    ) public payable virtual returns (PaymentData memory) {
        datas;
        from;
        to;
        who;
        repayData;
        for (uint256 i; i < actions.length; ++i) {
            ActionBorrowType action = actions[i];
            action;
        }

        if (paymentData.stablecoinAmountToReceive >= paymentData.stablecoinAmountToGive) {
            uint256 stablecoinPayment = paymentData.stablecoinAmountToReceive - paymentData.stablecoinAmountToGive;
            if (paymentData.collateralAmountToGive >= paymentData.collateralAmountToReceive) {
                uint256 collateralAmountToGive = paymentData.collateralAmountToGive -
                    paymentData.collateralAmountToReceive;
                collateral.safeTransfer(to, collateralAmountToGive);
                stablecoin.burnFrom(stablecoinPayment, from, msg.sender);
            } else {
                if (stablecoinPayment > 0) stablecoin.burnFrom(stablecoinPayment, from, msg.sender);
                // In this case the collateral amount is necessarily non null
                collateral.safeTransferFrom(
                    msg.sender,
                    address(this),
                    paymentData.collateralAmountToReceive - paymentData.collateralAmountToGive
                );
            }
        } else {
            uint256 stablecoinPayment = paymentData.stablecoinAmountToGive - paymentData.stablecoinAmountToReceive;
            // `stablecoinPayment` is strictly positive in this case
            stablecoin.mint(to, stablecoinPayment);
            if (paymentData.collateralAmountToGive > paymentData.collateralAmountToReceive) {
                collateral.safeTransfer(to, paymentData.collateralAmountToGive - paymentData.collateralAmountToReceive);
            } else {
                uint256 collateralPayment = paymentData.collateralAmountToReceive - paymentData.collateralAmountToGive;
                collateral.safeTransferFrom(msg.sender, address(this), collateralPayment);
            }
        }

        return paymentData;
    }

    /// @notice Allows an address to give or revoke approval for all its vaults to another address
    /// @param owner Address signing the permit and giving (or revoking) its approval for all the controlled vaults
    /// @param spender Address to give approval to
    /// @param approvedStatus Whether to give or revoke the approval
    /// @param deadline Deadline parameter for the signature to be valid
    /// @dev The `v`, `r`, and `s` parameters are used as signature data
    function permit(
        address owner,
        address spender,
        bool approvedStatus,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (block.timestamp > deadline) revert ExpiredDeadline();
        // Additional signature checks performed in the `ECDSAUpgradeable.recover` function
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0 || (v != 27 && v != 28))
            revert InvalidSignature();

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                _domainSeparatorV4(),
                keccak256(
                    abi.encode(
                        _PERMIT_TYPEHASH,
                        // 0x3f43a9c6bafb5c7aab4e0cfe239dc5d4c15caf0381c6104188191f78a6640bd8,
                        owner,
                        spender,
                        approvedStatus,
                        _useNonce(owner),
                        deadline
                    )
                )
            )
        );
        if (owner.isContract()) {
            if (IERC1271(owner).isValidSignature(digest, abi.encodePacked(r, s, v)) != 0x1626ba7e)
                revert InvalidSignature();
        } else {
            address signer = ecrecover(digest, v, r, s);
            if (signer != owner || signer == address(0)) revert InvalidSignature();
        }

        _setApprovalForAll(owner, spender, approvedStatus);
    }

    function approveSpenderVault(
        address spender,
        uint256 vaultID,
        bool status
    ) external {
        approved[vaultID][spender] = status;
    }

    /// @notice Checks whether a given address is approved for a vault or owns this vault
    /// @param spender Address for which vault ownership should be checked
    /// @param vaultID ID of the vault to check
    /// @return Whether the `spender` address owns or is approved for `vaultID`
    function isApprovedOrOwner(address spender, uint256 vaultID) external view returns (bool) {
        return approved[vaultID][spender];
    }

    /// @notice Internal version of the `setApprovalForAll` function
    /// @dev It contains an `approver` field to be used in case someone signs a permit for a particular
    /// address, and this signature is given to the contract by another address (like a router)
    function _setApprovalForAll(
        address approver,
        address operator,
        bool approvedStatus
    ) internal {
        if (operator == approver) revert("approval to caller");
        uint256 approval = approvedStatus ? 1 : 0;
        operatorApprovals[approver][operator] = approval;
    }

    /// @notice Returns the current nonce for an `owner` address
    function nonces(address owner) public view returns (uint256) {
        return _nonces[owner];
    }

    /// @notice Returns the domain separator for the current chain.
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Internal version of the `DOMAIN_SEPARATOR` function
    function _domainSeparatorV4() internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    // keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
                    0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f,
                    _HASHED_NAME,
                    _HASHED_VERSION,
                    block.chainid,
                    address(this)
                )
            );
    }

    /// @notice Consumes a nonce for an address: returns the current value and increments it
    function _useNonce(address owner) internal returns (uint256 current) {
        current = _nonces[owner];
        _nonces[owner] = current + 1;
    }

    uint256[49] private __gap;
}
