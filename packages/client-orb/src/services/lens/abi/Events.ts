export default [
  {
    anonymous: false,
    inputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "publicationActedProfileId",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "publicationActedId",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "actorProfileId",
            type: "uint256",
          },
          {
            internalType: "uint256[]",
            name: "referrerProfileIds",
            type: "uint256[]",
          },
          {
            internalType: "uint256[]",
            name: "referrerPubIds",
            type: "uint256[]",
          },
          {
            internalType: "address",
            name: "actionModuleAddress",
            type: "address",
          },
          {
            internalType: "bytes",
            name: "actionModuleData",
            type: "bytes",
          },
        ],
        indexed: false,
        internalType: "struct Types.PublicationActionParams",
        name: "publicationActionParams",
        type: "tuple",
      },
      {
        indexed: false,
        internalType: "bytes",
        name: "actionModuleReturnData",
        type: "bytes",
      },
      {
        indexed: false,
        internalType: "address",
        name: "transactionExecutor",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "Acted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "string",
        name: "name",
        type: "string",
      },
      {
        indexed: false,
        internalType: "string",
        name: "symbol",
        type: "string",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "BaseInitialized",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "byProfileId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "idOfProfileBlocked",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "transactionExecutor",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "Blocked",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "profileId",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "pubId",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "collectNFTId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        indexed: false,
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "CollectNFTTransferred",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "profileId",
            type: "uint256",
          },
          {
            internalType: "string",
            name: "contentURI",
            type: "string",
          },
          {
            internalType: "uint256",
            name: "pointedProfileId",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "pointedPubId",
            type: "uint256",
          },
          {
            internalType: "uint256[]",
            name: "referrerProfileIds",
            type: "uint256[]",
          },
          {
            internalType: "uint256[]",
            name: "referrerPubIds",
            type: "uint256[]",
          },
          {
            internalType: "bytes",
            name: "referenceModuleData",
            type: "bytes",
          },
          {
            internalType: "address[]",
            name: "actionModules",
            type: "address[]",
          },
          {
            internalType: "bytes[]",
            name: "actionModulesInitDatas",
            type: "bytes[]",
          },
          {
            internalType: "address",
            name: "referenceModule",
            type: "address",
          },
          {
            internalType: "bytes",
            name: "referenceModuleInitData",
            type: "bytes",
          },
        ],
        indexed: false,
        internalType: "struct Types.CommentParams",
        name: "commentParams",
        type: "tuple",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "pubId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "bytes",
        name: "referenceModuleReturnData",
        type: "bytes",
      },
      {
        indexed: false,
        internalType: "bytes[]",
        name: "actionModulesInitReturnDatas",
        type: "bytes[]",
      },
      {
        indexed: false,
        internalType: "bytes",
        name: "referenceModuleInitReturnData",
        type: "bytes",
      },
      {
        indexed: false,
        internalType: "address",
        name: "transactionExecutor",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "CommentCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "delegatorProfileId",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "configNumber",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "DelegatedExecutorsConfigApplied",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "delegatorProfileId",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "configNumber",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address[]",
        name: "delegatedExecutors",
        type: "address[]",
      },
      {
        indexed: false,
        internalType: "bool[]",
        name: "approvals",
        type: "bool[]",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "DelegatedExecutorsConfigChanged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "caller",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "oldEmergencyAdmin",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "newEmergencyAdmin",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "EmergencyAdminSet",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "profileId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "followModule",
        type: "address",
      },
      {
        indexed: false,
        internalType: "bytes",
        name: "followModuleInitData",
        type: "bytes",
      },
      {
        indexed: false,
        internalType: "bytes",
        name: "followModuleReturnData",
        type: "bytes",
      },
      {
        indexed: false,
        internalType: "address",
        name: "transactionExecutor",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "FollowModuleSet",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "profileId",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "followNFT",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "FollowNFTDeployed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "followerProfileId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "idOfProfileFollowed",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "followTokenIdAssigned",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "bytes",
        name: "followModuleData",
        type: "bytes",
      },
      {
        indexed: false,
        internalType: "bytes",
        name: "processFollowModuleReturnData",
        type: "bytes",
      },
      {
        indexed: false,
        internalType: "address",
        name: "transactionExecutor",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "Followed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "caller",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "prevGovernance",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "newGovernance",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "GovernanceSet",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "profileId",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "pubId",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "collectNFT",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "LegacyCollectNFTDeployed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "profileId",
            type: "uint256",
          },
          {
            internalType: "string",
            name: "metadataURI",
            type: "string",
          },
          {
            internalType: "uint256",
            name: "pointedProfileId",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "pointedPubId",
            type: "uint256",
          },
          {
            internalType: "uint256[]",
            name: "referrerProfileIds",
            type: "uint256[]",
          },
          {
            internalType: "uint256[]",
            name: "referrerPubIds",
            type: "uint256[]",
          },
          {
            internalType: "bytes",
            name: "referenceModuleData",
            type: "bytes",
          },
        ],
        indexed: false,
        internalType: "struct Types.MirrorParams",
        name: "mirrorParams",
        type: "tuple",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "pubId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "bytes",
        name: "referenceModuleReturnData",
        type: "bytes",
      },
      {
        indexed: false,
        internalType: "address",
        name: "transactionExecutor",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "MirrorCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "signer",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "nonce",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "NonceUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "profileId",
            type: "uint256",
          },
          {
            internalType: "string",
            name: "contentURI",
            type: "string",
          },
          {
            internalType: "address[]",
            name: "actionModules",
            type: "address[]",
          },
          {
            internalType: "bytes[]",
            name: "actionModulesInitDatas",
            type: "bytes[]",
          },
          {
            internalType: "address",
            name: "referenceModule",
            type: "address",
          },
          {
            internalType: "bytes",
            name: "referenceModuleInitData",
            type: "bytes",
          },
        ],
        indexed: false,
        internalType: "struct Types.PostParams",
        name: "postParams",
        type: "tuple",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "pubId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "bytes[]",
        name: "actionModulesInitReturnDatas",
        type: "bytes[]",
      },
      {
        indexed: false,
        internalType: "bytes",
        name: "referenceModuleInitReturnData",
        type: "bytes",
      },
      {
        indexed: false,
        internalType: "address",
        name: "transactionExecutor",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "PostCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "profileId",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "creator",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "ProfileCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "profileCreator",
        type: "address",
      },
      {
        indexed: true,
        internalType: "bool",
        name: "whitelisted",
        type: "bool",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "ProfileCreatorWhitelisted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "profileId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "string",
        name: "metadata",
        type: "string",
      },
      {
        indexed: false,
        internalType: "address",
        name: "transactionExecutor",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "ProfileMetadataSet",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "profileId",
            type: "uint256",
          },
          {
            internalType: "string",
            name: "contentURI",
            type: "string",
          },
          {
            internalType: "uint256",
            name: "pointedProfileId",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "pointedPubId",
            type: "uint256",
          },
          {
            internalType: "uint256[]",
            name: "referrerProfileIds",
            type: "uint256[]",
          },
          {
            internalType: "uint256[]",
            name: "referrerPubIds",
            type: "uint256[]",
          },
          {
            internalType: "bytes",
            name: "referenceModuleData",
            type: "bytes",
          },
          {
            internalType: "address[]",
            name: "actionModules",
            type: "address[]",
          },
          {
            internalType: "bytes[]",
            name: "actionModulesInitDatas",
            type: "bytes[]",
          },
          {
            internalType: "address",
            name: "referenceModule",
            type: "address",
          },
          {
            internalType: "bytes",
            name: "referenceModuleInitData",
            type: "bytes",
          },
        ],
        indexed: false,
        internalType: "struct Types.QuoteParams",
        name: "quoteParams",
        type: "tuple",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "pubId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "bytes",
        name: "referenceModuleReturnData",
        type: "bytes",
      },
      {
        indexed: false,
        internalType: "bytes[]",
        name: "actionModulesInitReturnDatas",
        type: "bytes[]",
      },
      {
        indexed: false,
        internalType: "bytes",
        name: "referenceModuleInitReturnData",
        type: "bytes",
      },
      {
        indexed: false,
        internalType: "address",
        name: "transactionExecutor",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "QuoteCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "caller",
        type: "address",
      },
      {
        indexed: true,
        internalType: "enum Types.ProtocolState",
        name: "prevState",
        type: "uint8",
      },
      {
        indexed: true,
        internalType: "enum Types.ProtocolState",
        name: "newState",
        type: "uint8",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "StateSet",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "wallet",
        type: "address",
      },
      {
        indexed: true,
        internalType: "bool",
        name: "enabled",
        type: "bool",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "tokenGuardianDisablingTimestamp",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "TokenGuardianStateChanged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint16",
        name: "prevTreasuryFee",
        type: "uint16",
      },
      {
        indexed: true,
        internalType: "uint16",
        name: "newTreasuryFee",
        type: "uint16",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "TreasuryFeeSet",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "prevTreasury",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "newTreasury",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "TreasurySet",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "byProfileId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "idOfProfileUnblocked",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "transactionExecutor",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "Unblocked",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "unfollowerProfileId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "idOfProfileUnfollowed",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "transactionExecutor",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "Unfollowed",
    type: "event",
  },
];
