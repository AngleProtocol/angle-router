// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.12;

import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-ERC20PermitUpgradeable.sol";

import "../../interfaces/IPoolManager.sol";
import "./IMockUpgradeSanToken.sol";
import "../../interfaces/IStableMaster.sol";

contract MockUpgradeSanToken is IMockUpgradeSanToken, ERC20PermitUpgradeable {
    uint8 public decimal;
    address public override stableMaster;
    address public override poolManager;

    // Random functions added for testing storage collision
    // https://docs.openzeppelin.com/upgrades-plugins/1.x/proxies#storage-collisions-between-implementation-versions
    uint256 public var7;
    uint256 public var8;
    address public var9;
    address public var10;
    uint256 public var11;
    uint256 public var12;

    uint256 public a;
    uint256 public b;
    address public c;
    address public d;
    uint256 public e;
    uint256 public f;

    function initialize(
        string memory name_,
        string memory symbol_,
        address _poolManager
    ) public initializer {
        __ERC20Permit_init(name_);
        __ERC20_init(name_, symbol_);
        poolManager = _poolManager;
        stableMaster = IPoolManager(poolManager).stableMaster();
        decimal = IERC20MetadataUpgradeable(IPoolManager(poolManager).token()).decimals();
    }

    modifier onlyStableMaster() {
        require(msg.sender == stableMaster, "1");
        _;
    }

    function decimals() public view override returns (uint8) {
        return decimal;
    }

    function burnNoRedeem(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    // Only change: added "randomParam"
    function mint(
        address account,
        uint256 amount,
        uint256 randomParam
    ) external override returns (uint256) {
        _mint(account, amount);
        return randomParam;
    }

    function burnSelf(uint256 amount, address burner) external override onlyStableMaster {
        _burn(burner, amount);
    }

    function burnFrom(
        uint256 amount,
        address burner,
        address sender
    ) external override onlyStableMaster {
        uint256 currentAllowance = allowance(burner, sender);
        require(currentAllowance >= amount, "23");
        _approve(burner, sender, currentAllowance - amount);
        _burn(burner, amount);
    }
}
