/** Chain ID và ABI dùng chung giữa server, worker, script deploy và trình duyệt cho OopsFuji trên Avalanche Fuji. */

export const FUJI_CHAIN_ID = 43113 as const;
export const FUJI_CHAIN_HEX = "0xa869" as const;
export const FUJI_DEFAULT_RPC_URL = "https://api.avax-test.network/ext/bc/C/rpc";
export const FUJI_EXPLORER_URL = "https://testnet.snowtrace.io";
export const OOPS_FUJI_CREDENTIAL_SIGNATURE = "function isEligible(address wallet) view returns (bool)";

export const OOPS_FUJI_CREDENTIAL_FUNCTION_ABI = [
  {
    type: "function",
    name: "isEligible",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const OOPS_FUJI_ABI = [
  {
    type: "constructor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "initialOperator", type: "address" },
      { name: "initialAutoEligible", type: "bool" },
    ],
  },
  { type: "error", name: "NotOwner", inputs: [] },
  { type: "error", name: "NotOperator", inputs: [] },
  { type: "error", name: "ZeroAddress", inputs: [] },
  { type: "error", name: "InvalidChallenge", inputs: [] },
  { type: "error", name: "ChallengeAlreadyUsed", inputs: [] },
  { type: "error", name: "RoundAlreadyExists", inputs: [] },
  { type: "error", name: "RoundNotFound", inputs: [] },
  { type: "error", name: "InvalidRoundParams", inputs: [] },
  { type: "error", name: "DuplicateParticipant", inputs: [] },
  { type: "error", name: "OpenDeadlinePassed", inputs: [] },
  { type: "error", name: "VersionHashMismatch", inputs: [] },
  { type: "error", name: "ConfirmationExpired", inputs: [] },
  { type: "error", name: "NotParticipant", inputs: [] },
  { type: "error", name: "AlreadyConfirmed", inputs: [] },
  {
    type: "event",
    name: "OwnershipTransferred",
    anonymous: false,
    inputs: [
      { name: "previousOwner", type: "address", indexed: true },
      { name: "newOwner", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "OperatorUpdated",
    anonymous: false,
    inputs: [
      { name: "previousOperator", type: "address", indexed: true },
      { name: "newOperator", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "AutoEligibleUpdated",
    anonymous: false,
    inputs: [{ name: "enabled", type: "bool", indexed: false }],
  },
  {
    type: "event",
    name: "EligibilityUpdated",
    anonymous: false,
    inputs: [
      { name: "wallet", type: "address", indexed: true },
      { name: "eligible", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "WalletProved",
    anonymous: false,
    inputs: [
      { name: "wallet", type: "address", indexed: true },
      { name: "challengeHash", type: "bytes32", indexed: true },
      { name: "provedAt", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RoundOpened",
    anonymous: false,
    inputs: [
      { name: "roundKey", type: "bytes32", indexed: true },
      { name: "versionHash", type: "bytes32", indexed: true },
      { name: "openedAt", type: "uint64", indexed: false },
      { name: "confirmBy", type: "uint64", indexed: false },
      { name: "participants", type: "address[]", indexed: false },
    ],
  },
  {
    type: "event",
    name: "VersionConfirmed",
    anonymous: false,
    inputs: [
      { name: "roundKey", type: "bytes32", indexed: true },
      { name: "versionHash", type: "bytes32", indexed: true },
      { name: "wallet", type: "address", indexed: true },
      { name: "confirmedAt", type: "uint64", indexed: false },
    ],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "operator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "autoEligibleOnProve",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "usedChallenges",
    stateMutability: "view",
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "transferOwnership",
    stateMutability: "nonpayable",
    inputs: [{ name: "nextOwner", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setOperator",
    stateMutability: "nonpayable",
    inputs: [{ name: "nextOperator", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setAutoEligibleOnProve",
    stateMutability: "nonpayable",
    inputs: [{ name: "enabled", type: "bool" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setEligible",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "eligible", type: "bool" },
    ],
    outputs: [],
  },
  ...OOPS_FUJI_CREDENTIAL_FUNCTION_ABI,
  {
    type: "function",
    name: "proveWallet",
    stateMutability: "nonpayable",
    inputs: [{ name: "challengeHash", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "openRound",
    stateMutability: "nonpayable",
    inputs: [
      { name: "roundKey", type: "bytes32" },
      { name: "versionHash", type: "bytes32" },
      { name: "participants", type: "address[]" },
      { name: "signingHours", type: "uint64" },
      { name: "openBy", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "confirmVersion",
    stateMutability: "nonpayable",
    inputs: [
      { name: "roundKey", type: "bytes32" },
      { name: "versionHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getRound",
    stateMutability: "view",
    inputs: [{ name: "roundKey", type: "bytes32" }],
    outputs: [
      { name: "exists", type: "bool" },
      { name: "versionHash", type: "bytes32" },
      { name: "openedAt", type: "uint64" },
      { name: "confirmBy", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "isRoundParticipant",
    stateMutability: "view",
    inputs: [
      { name: "roundKey", type: "bytes32" },
      { name: "wallet", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "hasConfirmed",
    stateMutability: "view",
    inputs: [
      { name: "roundKey", type: "bytes32" },
      { name: "wallet", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
