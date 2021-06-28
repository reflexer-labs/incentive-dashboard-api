export const AAVE_RAI_GET_RESERVE_DATA_ABI = {
  inputs: [{ internalType: "address", name: "asset", type: "address" }],
  name: "getReserveData",
  outputs: [
    {
      components: [
        {
          components: [{ internalType: "uint256", name: "data", type: "uint256" }],
          internalType: "struct DataTypes.ReserveConfigurationMap",
          name: "configuration",
          type: "tuple",
        },
        { internalType: "uint128", name: "liquidityIndex", type: "uint128" },
        { internalType: "uint128", name: "variableBorrowIndex", type: "uint128" },
        { internalType: "uint128", name: "currentLiquidityRate", type: "uint128" },
        { internalType: "uint128", name: "currentVariableBorrowRate", type: "uint128" },
        { internalType: "uint128", name: "currentStableBorrowRate", type: "uint128" },
        { internalType: "uint40", name: "lastUpdateTimestamp", type: "uint40" },
        { internalType: "address", name: "aTokenAddress", type: "address" },
        { internalType: "address", name: "stableDebtTokenAddress", type: "address" },
        { internalType: "address", name: "variableDebtTokenAddress", type: "address" },
        { internalType: "address", name: "interestRateStrategyAddress", type: "address" },
        { internalType: "uint8", name: "id", type: "uint8" },
      ],
      internalType: "struct DataTypes.ReserveData",
      name: "",
      type: "tuple",
    },
  ],
  stateMutability: "view",
  type: "function",
};

export const IDLE_GET_APR_ABI = {
  constant: true,
  inputs: [],
  name: "getAvgAPR",
  outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
  payable: false,
  stateMutability: "view",
  type: "function",
};

export const IDLE_TOKEN_PRICE = {
  constant: true,
  inputs: [],
  name: "tokenPrice",
  outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
  payable: false,
  stateMutability: "view",
  type: "function",
};

export const FUSE_TOTAL_BORROW = {
  constant: true,
  inputs: [],
  name: "totalBorrows",
  outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
  payable: false,
  stateMutability: "view",
  type: "function",
};

export const FUSE_BORROW_RATE = {
  constant: true,
  inputs: [],
  name: "borrowRatePerBlock",
  outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
  payable: false,
  stateMutability: "view",
  type: "function",
};

export const FUSE_SUPPLY_RATE = {
  constant: true,
  inputs: [],
  name: "supplyRatePerBlock",
  outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
  payable: false,
  stateMutability: "view",
  type: "function",
};

export const KASHI_TOTAL_BORROW = {
  inputs: [],
  name: "totalBorrow",
  outputs: [
    { internalType: "uint128", name: "elastic", type: "uint128" },
    { internalType: "uint128", name: "base", type: "uint128" },
  ],
  stateMutability: "view",
  type: "function",
};
