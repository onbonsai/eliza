[@ai16z/eliza v0.1.5-alpha.0](../index.md) / GenerationOptions

# Interface: GenerationOptions

Configuration options for generating objects with a model.

## Properties

### runtime

> **runtime**: [`IAgentRuntime`](IAgentRuntime.md)

#### Defined in

[packages/core/src/generation.ts:1138](https://github.com/mad-finance/eliza/blob/main/packages/core/src/generation.ts#L1138)

***

### context

> **context**: `string`

#### Defined in

[packages/core/src/generation.ts:1139](https://github.com/mad-finance/eliza/blob/main/packages/core/src/generation.ts#L1139)

***

### modelClass

> **modelClass**: [`ModelClass`](../enumerations/ModelClass.md)

#### Defined in

[packages/core/src/generation.ts:1140](https://github.com/mad-finance/eliza/blob/main/packages/core/src/generation.ts#L1140)

***

### schema?

> `optional` **schema**: `ZodType`\<`any`, `ZodTypeDef`, `any`\>

#### Defined in

[packages/core/src/generation.ts:1141](https://github.com/mad-finance/eliza/blob/main/packages/core/src/generation.ts#L1141)

***

### schemaName?

> `optional` **schemaName**: `string`

#### Defined in

[packages/core/src/generation.ts:1142](https://github.com/mad-finance/eliza/blob/main/packages/core/src/generation.ts#L1142)

***

### schemaDescription?

> `optional` **schemaDescription**: `string`

#### Defined in

[packages/core/src/generation.ts:1143](https://github.com/mad-finance/eliza/blob/main/packages/core/src/generation.ts#L1143)

***

### stop?

> `optional` **stop**: `string`[]

#### Defined in

[packages/core/src/generation.ts:1144](https://github.com/mad-finance/eliza/blob/main/packages/core/src/generation.ts#L1144)

***

### mode?

> `optional` **mode**: `"auto"` \| `"json"` \| `"tool"`

#### Defined in

[packages/core/src/generation.ts:1145](https://github.com/mad-finance/eliza/blob/main/packages/core/src/generation.ts#L1145)

***

### experimental\_providerMetadata?

> `optional` **experimental\_providerMetadata**: `Record`\<`string`, `unknown`\>

#### Defined in

[packages/core/src/generation.ts:1146](https://github.com/mad-finance/eliza/blob/main/packages/core/src/generation.ts#L1146)
