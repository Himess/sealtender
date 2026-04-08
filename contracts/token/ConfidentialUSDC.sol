// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ConfidentialUSDC
 * @notice FHE-encrypted ERC7984 token backed by USDC with wrap/unwrap and faucet.
 */
contract ConfidentialUSDC is ZamaEthereumConfig, ERC7984, Ownable2Step {
    using SafeERC20 for IERC20;

    // --- Constants ---
    uint256 public constant FAUCET_MAX = 10_000 * 1e6;
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    // --- State ---
    IERC20 public underlyingUSDC;
    address public pendingUnderlyingUSDC;
    uint256 public underlyingChangeTime;
    uint256 public constant UNDERLYING_CHANGE_DELAY = 2 days;
    mapping(address => uint256) public lastFaucetTime;

    // --- Events ---
    event Minted(address indexed to, uint256 amount);
    event Burned(address indexed from, uint256 amount);
    event Wrapped(address indexed user, uint256 amount);
    event Unwrapped(address indexed user, uint256 amount);
    event FaucetUsed(address indexed user, uint256 amount);
    event UnderlyingUSDCSet(address indexed token);
    event UnderlyingUSDCChangeProposed(address indexed newToken, uint256 effectiveTime);

    // --- Errors ---
    error FaucetAmountExceedsMax();
    error FaucetAmountZero();
    error FaucetCooldown();
    error WrapDisabled();
    error WrapAmountZero();

    constructor(address initialOwner)
        ERC7984("Confidential USDC", "cUSDC", "")
        Ownable(initialOwner)
    {}

    // --- Admin ---

    function mint(address to, uint256 amount) external onlyOwner {
        euint64 encAmount = FHE.asEuint64(uint64(amount));
        _mint(to, encAmount);
        emit Minted(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        euint64 encAmount = FHE.asEuint64(uint64(amount));
        _burn(from, encAmount);
        emit Burned(from, amount);
    }

    function setUnderlyingUSDC(address _usdc) external onlyOwner {
        require(address(underlyingUSDC) == address(0), "Use propose/execute to change");
        underlyingUSDC = IERC20(_usdc);
        emit UnderlyingUSDCSet(_usdc);
    }

    function proposeUnderlyingUSDC(address _usdc) external onlyOwner {
        pendingUnderlyingUSDC = _usdc;
        underlyingChangeTime = block.timestamp + UNDERLYING_CHANGE_DELAY;
        emit UnderlyingUSDCChangeProposed(_usdc, underlyingChangeTime);
    }

    function executeUnderlyingUSDCChange() external onlyOwner {
        require(pendingUnderlyingUSDC != address(0), "No pending change");
        require(block.timestamp >= underlyingChangeTime, "Timelock not expired");
        underlyingUSDC = IERC20(pendingUnderlyingUSDC);
        emit UnderlyingUSDCSet(pendingUnderlyingUSDC);
        pendingUnderlyingUSDC = address(0);
        underlyingChangeTime = 0;
    }

    // --- Wrap/Unwrap ---

    function wrap(uint256 amount) external {
        if (address(underlyingUSDC) == address(0)) revert WrapDisabled();
        if (amount == 0) revert WrapAmountZero();

        underlyingUSDC.safeTransferFrom(msg.sender, address(this), amount);

        euint64 encAmount = FHE.asEuint64(uint64(amount));
        _mint(msg.sender, encAmount);

        emit Wrapped(msg.sender, amount);
    }

    function unwrap(uint256 amount) external {
        if (address(underlyingUSDC) == address(0)) revert WrapDisabled();
        if (amount == 0) revert WrapAmountZero();

        euint64 encAmount = FHE.asEuint64(uint64(amount));
        _burn(msg.sender, encAmount);

        underlyingUSDC.safeTransfer(msg.sender, amount);

        emit Unwrapped(msg.sender, amount);
    }

    // --- Faucet ---

    function faucet(uint256 amount) external {
        if (amount == 0) revert FaucetAmountZero();
        if (amount > FAUCET_MAX) revert FaucetAmountExceedsMax();
        if (block.timestamp < lastFaucetTime[msg.sender] + FAUCET_COOLDOWN) {
            revert FaucetCooldown();
        }

        lastFaucetTime[msg.sender] = block.timestamp;

        euint64 encAmount = FHE.asEuint64(uint64(amount));
        _mint(msg.sender, encAmount);

        emit FaucetUsed(msg.sender, amount);
    }
}
