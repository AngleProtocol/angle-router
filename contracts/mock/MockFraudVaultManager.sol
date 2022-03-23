// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/IVaultManager.sol";
import "../interfaces/ITreasury.sol";
import "../interfaces/IAgToken.sol";

contract MockFraudVaultManager {
    using SafeERC20 for IERC20;

    ITreasury public treasury;
    mapping(uint256 => Vault) public vaultData;
    mapping(uint256 => address) public ownerOf;
    uint256 public surplus;
    uint256 public badDebt;
    IAgToken public stablecoin;
    address public oracle = address(this);

    address public governor;
    IERC20 public collateral;
    uint256 public oracleValue;
    uint256 public interestAccumulator;
    uint256 public collateralFactor;
    uint256 public totalNormalizedDebt;

    PaymentData public paymentData;

    constructor(address _treasury) {
        treasury = ITreasury(_treasury);
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
    ) public payable returns (PaymentData memory) {
        datas;
        from;
        to;
        who;
        repayData;
        for (uint256 i = 0; i < actions.length; i++) {
            ActionBorrowType action = actions[i];
            action;
        }

        return paymentData;
    }
}
