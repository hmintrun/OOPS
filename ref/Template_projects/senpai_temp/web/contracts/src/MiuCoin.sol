// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @title MiuCoin
/// @notice SenpAI's own testnet token. ERC-20 + EIP-2612 permit + EIP-3009
/// transfer-with-authorization, which is what the x402 "exact" scheme settles with:
/// the payer signs off-chain, the facilitator submits and pays gas.
/// Testnet only. The owner (the app's relayer) mints for the in-app faucet.
contract MiuCoin is ERC20, ERC20Permit, Ownable {
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 public constant CANCEL_AUTHORIZATION_TYPEHASH = keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    mapping(address authorizer => mapping(bytes32 nonce => bool used)) private _authorizationStates;

    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    error AuthorizationNotYetValid();
    error AuthorizationExpired();
    error AuthorizationUsedOrCanceled();
    error InvalidSignature();
    error CallerMustBePayee();

    constructor(string memory name_, string memory symbol_, address owner_)
        ERC20(name_, symbol_)
        ERC20Permit(name_)
        Ownable(owner_)
    {}

    /// @notice EIP-712 domain version, read by x402 facilitators to rebuild the domain.
    function version() external pure returns (string memory) {
        return "1";
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool) {
        return _authorizationStates[authorizer][nonce];
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _useAuthorization(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce, abi.encodePacked(r, s, v));
    }

    /// @dev Bytes-signature overload (USDC v2.2 style), also accepts ERC-1271 wallets.
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external {
        _useAuthorization(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce, signature);
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (to != msg.sender) revert CallerMustBePayee();
        _useAuthorization(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce, abi.encodePacked(r, s, v));
    }

    function cancelAuthorization(address authorizer, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external {
        if (_authorizationStates[authorizer][nonce]) revert AuthorizationUsedOrCanceled();
        _requireSignedBy(authorizer, keccak256(abi.encode(CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce)), abi.encodePacked(r, s, v));
        _authorizationStates[authorizer][nonce] = true;
        emit AuthorizationCanceled(authorizer, nonce);
    }

    function _useAuthorization(
        bytes32 typehash,
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) private {
        if (block.timestamp <= validAfter) revert AuthorizationNotYetValid();
        if (block.timestamp >= validBefore) revert AuthorizationExpired();
        if (_authorizationStates[from][nonce]) revert AuthorizationUsedOrCanceled();
        _requireSignedBy(from, keccak256(abi.encode(typehash, from, to, value, validAfter, validBefore, nonce)), signature);
        _authorizationStates[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
        _transfer(from, to, value);
    }

    function _requireSignedBy(address signer, bytes32 structHash, bytes memory signature) private view {
        if (!SignatureChecker.isValidSignatureNow(signer, _hashTypedDataV4(structHash), signature)) revert InvalidSignature();
    }
}
