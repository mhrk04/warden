// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title TestUSDC — a minimal, safe 6-decimal ERC-20 faucet token for testnet deployments.
/// @notice Named "Test USD Coin" / "tUSDC". Anyone may `mint` (it is a testnet faucet token,
///         never intended for mainnet or real value). Standard ERC-20 transfer/transferFrom/
///         approve semantics with boolean return values, so the Guard's SafeERC20-style
///         transfer path treats it as a well-behaved token.
contract TestUSDC {
    string public constant name = "Test USD Coin";
    string public constant symbol = "tUSDC";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /// @notice Faucet mint — open by design for a testnet token. Do not deploy to a network
    ///         where the token is expected to hold real value.
    function mint(address to, uint256 amount) external {
        require(to != address(0), "mint to zero");
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "transfer to zero");
        uint256 bal = balanceOf[from];
        require(bal >= amount, "balance");
        unchecked {
            balanceOf[from] = bal - amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }
}
