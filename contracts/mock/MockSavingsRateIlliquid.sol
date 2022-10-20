// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

// This mock only works for USDC as an asset
contract MockSavingsRateIlliquid is ERC4626 {
    mapping(address => uint256) public receiverRewards;
    uint256 public splitFactor;
    mapping(address => uint256) public counter;

    constructor(IERC20Metadata asset_) ERC20("savingsRate", "sr") ERC4626(asset_) {}

    function setSplitFactor(uint256 _splitFactor) external {
        splitFactor = _splitFactor;
    }

    function setReceiverRewards(address receiver, uint256 rewards) external {
        receiverRewards[receiver] = rewards;
    }

    function claimRedeem(address receiver, address[] memory strategiesToClaim) external returns (uint256 totalOwed) {
        totalOwed = receiverRewards[receiver];
        for (uint256 i = 0; i < strategiesToClaim.length; ++i) {
            counter[strategiesToClaim[i]] += 1;
        }
        IERC20Metadata(asset()).transfer(receiver, totalOwed);
    }

    function prepareRedeem(
        uint256 shares,
        address receiver,
        address owner
    ) external returns (uint256 assets) {
        if (msg.sender != owner) {
            _spendAllowance(owner, msg.sender, shares);
        }
        _burn(owner, shares);
        // divide by 10**9 * 10**(18-6)
        assets = (shares * (10**9 - splitFactor)) / 10**21;
        receiverRewards[receiver] = shares / 10**12 - assets;
        IERC20Metadata(asset()).transfer(receiver, assets);
    }
}
