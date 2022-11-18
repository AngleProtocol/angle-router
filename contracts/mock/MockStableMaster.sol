// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

import "../interfaces/ISanToken.sol";
import "../interfaces/IPerpetualManager.sol";
import "../interfaces/IStableMasterFront.sol";

import "./MockAgToken.sol";

contract MockStableMaster is IStableMasterFront {
    using SafeERC20 for IERC20;
    address public agToken;

    constructor(address _agToken) {
        agToken = _agToken;
    }

    struct Collateral {
        IERC20 collateral;
        ISanToken sanToken;
        IPerpetualManagerFrontWithClaim perpetualManager;
        address oracle;
        uint256 stocksUsers;
        uint256 sanRate;
        uint256 collatBase;
        SLPData slpData;
        MintBurnData feeData;
    }

    mapping(IPoolManager => Collateral) public collateralMap;

    function addCollateral(
        address poolManager,
        address collateral,
        address sanToken,
        address perpetualManager
    ) external {
        Collateral memory collat;
        collat.collateral = IERC20(collateral);
        collat.sanToken = ISanToken(sanToken);
        collat.perpetualManager = IPerpetualManagerFrontWithClaim(perpetualManager);
        collateralMap[IPoolManager(poolManager)] = collat;
    }

    function mint(
        uint256 amount,
        address user,
        IPoolManager poolManager,
        uint256
    ) external {
        collateralMap[poolManager].collateral.safeTransferFrom(msg.sender, address(this), amount);
        MockAgToken(agToken).mint(user, amount);
    }

    function burn(
        uint256 amount,
        address burner,
        address dest,
        IPoolManager poolManager,
        uint256
    ) external {
        MockAgToken(agToken).burnSelf(amount, burner);
        collateralMap[poolManager].collateral.safeTransfer(dest, amount);
    }

    function deposit(
        uint256 amount,
        address user,
        IPoolManager poolManager
    ) external {
        collateralMap[poolManager].collateral.safeTransferFrom(msg.sender, address(this), amount);
        IERC20(address(collateralMap[poolManager].sanToken)).safeTransfer(user, amount);
    }

    function withdraw(
        uint256 amount,
        address burner,
        address dest,
        IPoolManager poolManager
    ) external {
        IERC20(address(collateralMap[poolManager].sanToken)).safeTransferFrom(burner, address(this), amount);
        collateralMap[poolManager].collateral.safeTransfer(dest, amount);
    }

    function updateStocksUsers(uint256, address) external {}
}
