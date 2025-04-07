import type { IAgentRuntime, UUID } from "@elizaos/core";
import type { ImageMetadata, TextOnlyMetadata, URI, VideoMetadata } from "@lens-protocol/metadata";
import type z from "zod";
import type { LanguageModelUsage } from "ai";

export enum LaunchpadChain {
  BASE = "base",
  LENS = "lens"
}

export enum SmartMediaStatus {
  ACTIVE = "active", // handler updated it
  FAILED = "failed", // handler failed to update it
  DISABLED = "disabled" // updates are disabled
}

export type SmartMediaBase = {
  agentId: UUID; // uuid
  creator: `0x${string}`; // lens account
  template: TemplateName;
  category: TemplateCategory;
  createdAt: number; // unix ts
  updatedAt: number; // unix ts
  templateData?: unknown; // specific data needed per template
}

export type LaunchpadToken = {
  chain: LaunchpadChain;
  address: `0x${string}`;
}

export type SmartMedia = SmartMediaBase & {
  postId: string; // lens post id; will be null for previews
  maxStaleTime: number; // seconds
  uri: URI; // lens storage node uri
  token?: LaunchpadToken; // optional associated token
  versions?: [string]; // versions of uri; only present in the db
  canvas?: string; // canvas html
  status?: SmartMediaStatus; // status of the last update; only present in the db
};

/**
 * SmartMedia templates
 */
export enum TemplateName {
  ADVENTURE_TIME = "adventure_time",
  EVOLVING_ART = "evolving_art",
  INFO_AGENT = "info_agent",
}

/**
 * SmartMedia categories and templates
 */
export enum TemplateCategory {
  EVOLVING_POST = "evolving_post",
  EVOLVING_ART = "evolving_art",
  CAMPFIRE = "campfire",
}

/**
 * Represents a Smart Media template
 */
export interface Template {
  /** Handler function */
  handler: TemplateHandler;

  /** Client metadata */
  clientMetadata: TemplateClientMetadata;
}

export type TemplateUsage = LanguageModelUsage & {
  imagesCreated?: number;
}

/**
 * Handler function for generating new metadata for a Smart Media post
 */
export type TemplateHandler = (
  runtime: IAgentRuntime,
  media?: SmartMedia,
  templateData?: unknown,
  options?: unknown,
) => Promise<TemplateHandlerResponse | null>;

/**
 * Handler response where one of preview or metadata must be present
 */
export interface TemplateHandlerResponse {
  preview?: { // not necessary for all templates
    text: string;
    image?: string; // base64
    video?: string,
  };
  metadata?: TextOnlyMetadata | ImageMetadata | VideoMetadata; // only undefined on failure or generating preview
  persistVersionUri?: string; // in case the handler wants versioning on the media
  updatedTemplateData?: unknown; // updated payload for the next generation
  totalUsage?: TemplateUsage;
}

/**
 * Expected request params for /post/create
 */
export interface CreateTemplateRequestParams {
  templateName: TemplateName;
  category: TemplateCategory;
  templateData: unknown;
}

/**
 * Define whether the smart media template requires an image, optional image, or no image
 */
export enum ImageRequirement {
  NONE = "none",
  OPTIONAL = "optional",
  REQUIRED = "required"
}

/**
 * Client metadata to faciliate the creation and configuration
 */
export type TemplateClientMetadata = {
  category: TemplateCategory;
  name: TemplateName;
  defaultModel?: string;

  /** Display info */
  displayName: string;
  description: string;
  image: string; // aspect ratio 3:2

  /** Form data */
  options: {
    allowPreview?: boolean;
    allowPreviousToken?: boolean;
    imageRequirement?: ImageRequirement;
    requireContent?: boolean;
    isCanvas?: boolean;
  };
  templateData: {
    form: z.ZodObject<any>;
  };

  /** Developer fee recipient: https://docs.bonsai.meme/elizaos/client-bonsai/developer-fees */
  protocolFeeRecipient: `0x${string}`;
};