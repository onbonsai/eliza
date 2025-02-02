export default [
    {
        type: "constructor",
        inputs: [
            {
                name: "_owner",
                type: "address",
                internalType: "address",
            },
            {
                name: "_quoteToken",
                type: "address",
                internalType: "address",
            },
            {
                name: "_poolManager",
                type: "address",
                internalType: "address",
            },
            {
                name: "_posm",
                type: "address",
                internalType: "address",
            },
            {
                name: "_defaultHook",
                type: "address",
                internalType: "address",
            },
            {
                name: "_bonsaiNFT",
                type: "address",
                internalType: "address",
            },
            {
                name: "_bonsaiToken",
                type: "address",
                internalType: "address",
            },
            {
                name: "_lastClubId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "buyChips",
        inputs: [
            {
                name: "clubId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "amount",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "maxPrice",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "clientAddress",
                type: "address",
                internalType: "address",
            },
            {
                name: "recipient",
                type: "address",
                internalType: "address",
            },
            {
                name: "referral",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "clubFeesEarned",
        inputs: [
            {
                name: "clubId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [
            {
                name: "amount",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "clubIdCount",
        inputs: [],
        outputs: [
            {
                name: "",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "collectUniswapFees",
        inputs: [
            {
                name: "clubId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "defaultHook",
        inputs: [],
        outputs: [
            {
                name: "",
                type: "address",
                internalType: "address",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "feesEarned",
        inputs: [
            {
                name: "referral",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [
            {
                name: "amount",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "flatThreshold",
        inputs: [],
        outputs: [
            {
                name: "",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getBuyPrice",
        inputs: [
            {
                name: "supply",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "amount",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [
            {
                name: "price",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getBuyPriceByClub",
        inputs: [
            {
                name: "clubId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "amount",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [
            {
                name: "price",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getFees",
        inputs: [],
        outputs: [
            {
                name: "",
                type: "uint16",
                internalType: "uint16",
            },
            {
                name: "",
                type: "uint16",
                internalType: "uint16",
            },
            {
                name: "",
                type: "uint16",
                internalType: "uint16",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getSellPrice",
        inputs: [
            {
                name: "supply",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "amount",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [
            {
                name: "price",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getSellPriceByClub",
        inputs: [
            {
                name: "clubId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "amount",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [
            {
                name: "price",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "initialPrice",
        inputs: [],
        outputs: [
            {
                name: "",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "owner",
        inputs: [],
        outputs: [
            {
                name: "",
                type: "address",
                internalType: "address",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "registerClub",
        inputs: [
            {
                name: "hook",
                type: "address",
                internalType: "address",
            },
            {
                name: "tokenInfo",
                type: "bytes",
                internalType: "bytes",
            },
            {
                name: "initialSupply",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "creator",
                type: "address",
                internalType: "address",
            },
            {
                name: "cliffPercent",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "vestingDuration",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "registeredClubs",
        inputs: [
            {
                name: "clubId",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [
            {
                name: "hook",
                type: "address",
                internalType: "address",
            },
            {
                name: "createdAt",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "liquidity",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "token",
                type: "address",
                internalType: "contract VestingERC20",
            },
            {
                name: "complete",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "uniLpTokenId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "initialPrice",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "flatThreshold",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "targetPriceMultiplier",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "releaseLiquidity",
        inputs: [
            {
                name: "clubId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "minAmountOut",
                type: "uint128",
                internalType: "uint128",
            },
            {
                name: "swapInfoV4",
                type: "tuple",
                internalType: "struct SwapInfoV4",
                components: [
                    {
                        name: "path",
                        type: "tuple[]",
                        internalType: "struct PathKey[]",
                        components: [
                            {
                                name: "intermediateCurrency",
                                type: "address",
                                internalType: "Currency",
                            },
                            {
                                name: "fee",
                                type: "uint24",
                                internalType: "uint24",
                            },
                            {
                                name: "tickSpacing",
                                type: "int24",
                                internalType: "int24",
                            },
                            {
                                name: "hooks",
                                type: "address",
                                internalType: "contract IHooks",
                            },
                            {
                                name: "hookData",
                                type: "bytes",
                                internalType: "bytes",
                            },
                        ],
                    },
                    {
                        name: "router",
                        type: "address",
                        internalType: "contract IUniversalRouter",
                    },
                ],
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "renounceOwnership",
        inputs: [],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "sellChips",
        inputs: [
            {
                name: "clubId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "amount",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "minAmountOut",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "clientAddress",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "setClubParams",
        inputs: [
            {
                name: "_registrationCost",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "_initialPrice",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "_quoteTokenPercentForPool",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "_flatThreshold",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "_targetPriceMultiplier",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "setCreatorNft",
        inputs: [
            {
                name: "_creatorNFT",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "setDefaultHook",
        inputs: [
            {
                name: "_defaultHook",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "setFees",
        inputs: [
            {
                name: "_protocolFeeBps",
                type: "uint16",
                internalType: "uint16",
            },
            {
                name: "_creatorFeeBps",
                type: "uint16",
                internalType: "uint16",
            },
            {
                name: "_clientFeeBps",
                type: "uint16",
                internalType: "uint16",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "setRegisteredClubHookData",
        inputs: [
            {
                name: "clubId",
                type: "uint256",
                internalType: "uint256",
            },
            {
                name: "data",
                type: "bytes",
                internalType: "bytes",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "setUniV4",
        inputs: [
            {
                name: "_poolManager",
                type: "address",
                internalType: "address",
            },
            {
                name: "_posm",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "setWhitelistedHook",
        inputs: [
            {
                name: "_hook",
                type: "address",
                internalType: "address",
            },
            {
                name: "_whitelisted",
                type: "bool",
                internalType: "bool",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "targetPriceMultiplier",
        inputs: [],
        outputs: [
            {
                name: "",
                type: "uint256",
                internalType: "uint256",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "transferOwnership",
        inputs: [
            {
                name: "newOwner",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "whitelistedHooks",
        inputs: [
            {
                name: "",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [
            {
                name: "",
                type: "bool",
                internalType: "bool",
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "withdrawClubFeesEarned",
        inputs: [
            {
                name: "clubIds",
                type: "uint256[]",
                internalType: "uint256[]",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "withdrawFeesEarned",
        inputs: [
            {
                name: "recipient",
                type: "address",
                internalType: "address",
            },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "event",
        name: "ClubParams",
        inputs: [
            {
                name: "registrationCost",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
            {
                name: "initialPrice",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
            {
                name: "quoteTokenPercentForPool",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
            {
                name: "flatThreshold",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
            {
                name: "targetPriceMultiplier",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "Complete",
        inputs: [
            {
                name: "clubId",
                type: "uint256",
                indexed: true,
                internalType: "uint256",
            },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "FeesSet",
        inputs: [
            {
                name: "protocolFee",
                type: "uint16",
                indexed: false,
                internalType: "uint16",
            },
            {
                name: "creatorFee",
                type: "uint16",
                indexed: false,
                internalType: "uint16",
            },
            {
                name: "clientFee",
                type: "uint16",
                indexed: false,
                internalType: "uint16",
            },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "LiquidityReleased",
        inputs: [
            {
                name: "clubId",
                type: "uint256",
                indexed: true,
                internalType: "uint256",
            },
            {
                name: "hook",
                type: "address",
                indexed: false,
                internalType: "address",
            },
            {
                name: "uniTokenLp",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "OwnershipTransferred",
        inputs: [
            {
                name: "previousOwner",
                type: "address",
                indexed: true,
                internalType: "address",
            },
            {
                name: "newOwner",
                type: "address",
                indexed: true,
                internalType: "address",
            },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "RegisteredClub",
        inputs: [
            {
                name: "clubId",
                type: "uint256",
                indexed: true,
                internalType: "uint256",
            },
            {
                name: "creator",
                type: "address",
                indexed: true,
                internalType: "address",
            },
            {
                name: "tokenAddress",
                type: "address",
                indexed: true,
                internalType: "address",
            },
            {
                name: "initialSupply",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
            {
                name: "cliffPercent",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
            {
                name: "vestingDuration",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
            {
                name: "hasNFT",
                type: "bool",
                indexed: false,
                internalType: "bool",
            },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "Trade",
        inputs: [
            {
                name: "clubId",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
            {
                name: "amount",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
            {
                name: "isBuy",
                type: "bool",
                indexed: false,
                internalType: "bool",
            },
            {
                name: "actor",
                type: "address",
                indexed: false,
                internalType: "address",
            },
            {
                name: "price",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
            {
                name: "priceAfterProtocolFee",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
            {
                name: "complete",
                type: "bool",
                indexed: false,
                internalType: "bool",
            },
            {
                name: "creatorFee",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "UniswapFeesCollected",
        inputs: [
            {
                name: "tokenId",
                type: "uint256",
                indexed: false,
                internalType: "uint256",
            },
            {
                name: "token0",
                type: "address",
                indexed: false,
                internalType: "address",
            },
            {
                name: "token1",
                type: "address",
                indexed: false,
                internalType: "address",
            },
        ],
        anonymous: false,
    },
    {
        type: "error",
        name: "InitialTooLarge",
        inputs: [],
    },
    {
        type: "error",
        name: "InsufficientBalance",
        inputs: [],
    },
    {
        type: "error",
        name: "InsufficientPayment",
        inputs: [],
    },
    {
        type: "error",
        name: "InvalidHook",
        inputs: [],
    },
    {
        type: "error",
        name: "NotAllowed",
        inputs: [],
    },
    {
        type: "error",
        name: "NotRegistered",
        inputs: [],
    },
    {
        type: "error",
        name: "OwnableInvalidOwner",
        inputs: [
            {
                name: "owner",
                type: "address",
                internalType: "address",
            },
        ],
    },
    {
        type: "error",
        name: "OwnableUnauthorizedAccount",
        inputs: [
            {
                name: "account",
                type: "address",
                internalType: "address",
            },
        ],
    },
    {
        type: "error",
        name: "SafeERC20FailedOperation",
        inputs: [
            {
                name: "token",
                type: "address",
                internalType: "address",
            },
        ],
    },
    {
        type: "error",
        name: "Slippage",
        inputs: [
            {
                name: "price",
                type: "uint256",
                internalType: "uint256",
            },
        ],
    },
    {
        type: "error",
        name: "ZeroPrice",
        inputs: [],
    },
];
