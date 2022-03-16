// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockANGLE is ERC20 {
    event Minting(address indexed _to, address indexed _minter, uint256 _amount);

    event Burning(address indexed _from, address indexed _burner, uint256 _amount);

    /// @notice stablecoin constructor
    /// @param name_ the stablecoin name (example 'ANGLE')
    /// @param symbol_ the stablecoin symbol ('ANGLE')
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    /// @notice allow to mint
    /// @param account the account to mint to
    /// @param amount the amount to mint
    function mint(address account, uint256 amount) external {
        _mint(account, amount);
        emit Minting(account, msg.sender, amount);
    }

    /// @notice allow to burn
    /// @param account the account to burn from
    /// @param amount the amount of agToken to burn from caller
    function burn(address account, uint256 amount) public {
        _burn(account, amount);
        emit Burning(account, msg.sender, amount);
    }
}
