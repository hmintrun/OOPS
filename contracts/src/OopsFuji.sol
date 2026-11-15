// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title OopsFuji
 * @notice Minimal verification contract for OOPS on Avalanche Fuji (chainId 43113):
 *   1. Wallet ownership proof + demo credential tracking (`proveWallet`, `isEligible`, `setEligible`).
 *   2. Negotiation confirmation rounds (`openRound`, `confirmVersion`) with strict deadline & participant snapshot.
 * Private business data (household names, quantities, VND amounts, notes) stays off-chain.
 */
contract OopsFuji {
    address public owner;
    address public operator;
    bool public autoEligibleOnProve;

    struct Round {
        bool exists;
        bytes32 versionHash;
        uint64 openedAt;
        uint64 confirmBy;
    }

    mapping(address => bool) private _eligible;
    mapping(address => mapping(bytes32 => bool)) public usedChallenges;
    mapping(bytes32 => Round) private _rounds;
    mapping(bytes32 => mapping(address => bool)) private _participants;
    mapping(bytes32 => mapping(address => bool)) private _confirmed;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event AutoEligibleUpdated(bool enabled);
    event EligibilityUpdated(address indexed wallet, bool eligible);
    event WalletProved(address indexed wallet, bytes32 indexed challengeHash, uint64 provedAt);
    event RoundOpened(
        bytes32 indexed roundKey,
        bytes32 indexed versionHash,
        uint64 openedAt,
        uint64 confirmBy,
        address[] participants
    );
    event VersionConfirmed(
        bytes32 indexed roundKey,
        bytes32 indexed versionHash,
        address indexed wallet,
        uint64 confirmedAt
    );

    error NotOwner();
    error NotOperator();
    error ZeroAddress();
    error InvalidChallenge();
    error ChallengeAlreadyUsed();
    error RoundAlreadyExists();
    error RoundNotFound();
    error InvalidRoundParams();
    error DuplicateParticipant();
    error OpenDeadlinePassed();
    error VersionHashMismatch();
    error ConfirmationExpired();
    error NotParticipant();
    error AlreadyConfirmed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != owner && msg.sender != operator) revert NotOperator();
        _;
    }

    constructor(address initialOperator, bool initialAutoEligible) {
        owner = msg.sender;
        operator = initialOperator == address(0) ? msg.sender : initialOperator;
        autoEligibleOnProve = initialAutoEligible;
        emit OwnershipTransferred(address(0), msg.sender);
        emit OperatorUpdated(address(0), operator);
        emit AutoEligibleUpdated(initialAutoEligible);
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) revert ZeroAddress();
        address previous = owner;
        owner = nextOwner;
        emit OwnershipTransferred(previous, nextOwner);
    }

    function setOperator(address nextOperator) external onlyOwner {
        if (nextOperator == address(0)) revert ZeroAddress();
        address previous = operator;
        operator = nextOperator;
        emit OperatorUpdated(previous, nextOperator);
    }

    function setAutoEligibleOnProve(bool enabled) external onlyOwner {
        autoEligibleOnProve = enabled;
        emit AutoEligibleUpdated(enabled);
    }

    function setEligible(address wallet, bool eligible) external onlyOperator {
        if (wallet == address(0)) revert ZeroAddress();
        _eligible[wallet] = eligible;
        emit EligibilityUpdated(wallet, eligible);
    }

    function isEligible(address wallet) external view returns (bool) {
        return _eligible[wallet];
    }

    /**
     * @notice Emits an on-chain proof linking `msg.sender` to a server-issued `challengeHash`.
     */
    function proveWallet(bytes32 challengeHash) external {
        if (challengeHash == bytes32(0)) revert InvalidChallenge();
        if (usedChallenges[msg.sender][challengeHash]) revert ChallengeAlreadyUsed();

        usedChallenges[msg.sender][challengeHash] = true;
        if (autoEligibleOnProve && !_eligible[msg.sender]) {
            _eligible[msg.sender] = true;
            emit EligibilityUpdated(msg.sender, true);
        }

        emit WalletProved(msg.sender, challengeHash, uint64(block.timestamp));
    }

    /**
     * @notice Opens a single immutable confirmation round for an approved draft version.
     * `confirmBy` uses whole-hour block timestamp arithmetic to match Postgres `recordVerifiedRoundOpening`.
     */
    function openRound(
        bytes32 roundKey,
        bytes32 versionHash,
        address[] calldata participants,
        uint64 signingHours,
        uint64 openBy
    ) external onlyOperator {
        if (roundKey == bytes32(0) || versionHash == bytes32(0) || participants.length == 0 || signingHours == 0) {
            revert InvalidRoundParams();
        }
        if (_rounds[roundKey].exists) revert RoundAlreadyExists();
        if (openBy != 0 && block.timestamp >= openBy) revert OpenDeadlinePassed();

        uint64 openedAt = uint64(block.timestamp);
        uint64 confirmBy = openedAt + signingHours * 3600;

        _rounds[roundKey] = Round({
            exists: true,
            versionHash: versionHash,
            openedAt: openedAt,
            confirmBy: confirmBy
        });

        for (uint256 i = 0; i < participants.length; i++) {
            address participant = participants[i];
            if (participant == address(0)) revert ZeroAddress();
            if (_participants[roundKey][participant]) revert DuplicateParticipant();
            _participants[roundKey][participant] = true;
        }

        emit RoundOpened(roundKey, versionHash, openedAt, confirmBy, participants);
    }

    /**
     * @notice Household wallet confirms a specific `(roundKey, versionHash)` before strict `confirmBy`.
     */
    function confirmVersion(bytes32 roundKey, bytes32 versionHash) external {
        Round storage r = _rounds[roundKey];
        if (!r.exists) revert RoundNotFound();
        if (r.versionHash != versionHash) revert VersionHashMismatch();
        if (block.timestamp >= r.confirmBy) revert ConfirmationExpired();
        if (!_participants[roundKey][msg.sender]) revert NotParticipant();
        if (_confirmed[roundKey][msg.sender]) revert AlreadyConfirmed();

        _confirmed[roundKey][msg.sender] = true;
        emit VersionConfirmed(roundKey, versionHash, msg.sender, uint64(block.timestamp));
    }

    function getRound(bytes32 roundKey)
        external
        view
        returns (bool exists, bytes32 versionHash, uint64 openedAt, uint64 confirmBy)
    {
        Round storage r = _rounds[roundKey];
        return (r.exists, r.versionHash, r.openedAt, r.confirmBy);
    }

    function isRoundParticipant(bytes32 roundKey, address wallet) external view returns (bool) {
        return _participants[roundKey][wallet];
    }

    function hasConfirmed(bytes32 roundKey, address wallet) external view returns (bool) {
        return _confirmed[roundKey][wallet];
    }
}
