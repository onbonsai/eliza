import type { IAgentRuntime, UUID } from "@elizaos/core";

export interface SmartMediaBase {
  agentId: UUID; // uuid
  creator: `0x${string}`; // lens account
  template: TemplateName;
  category: TemplateCategory;
  createdAt: number; // unix ts
  updatedAt: number; // unix ts
  templateData?: unknown; // specific data needed per template
}

export type SmartMediaPreview = SmartMediaBase & {
  preview?: {
    text?: string;
    image?: string;
    video?: string;
  }
};

export type SmartMedia = SmartMediaBase & {
  postId: string; // lens post id; will be null for previews
  maxStaleTime: number; // seconds
  uri: string; // active post uri
  tokenAddress: `0x${string}`; // associated token address
  versions?: [string]; // versions of uri; only present in the db
};

/**
 * SmartMedia templates
 */
export enum TemplateName {
  ADVENTURE_TIME = "adventure_time",
}

/**
 * SmartMedia categories and templates
 */
export enum TemplateCategory {
  EVOLVING_POST = "evolving_post",
}

/**
 * Represents a Smart Media template
 */
export interface Template {
  /** Action name */
  name: TemplateName;

  /** Detailed description */
  description: string;

  /** Handler function */
  handler: TemplateHandler;
}

/**
 * Handler function type for processing messages
 */
export type TemplateHandler = (
  runtime: IAgentRuntime,
  refresh: boolean,
  media?: SmartMedia,
  templateData?: unknown,
) => Promise<TemplateHandlerResponse | null>;

/**
 * Callback function type for handlers
 */
export interface TemplateHandlerResponse {
  preview?: {
    text: string;
    image?: string; // base 64 jpeg/png (depending on the provider)
    video?: string,
  };
  uri?: string,
  updatedTemplateData?: unknown,
}