import type { IAgentRuntime, UUID } from "@elizaos/core";
import type { ImageMetadata, TextOnlyMetadata, URI, VideoMetadata } from "@lens-protocol/metadata";

/**
 * SmartMedia templates
 */
export enum LaunchpadChain {
  BASE = "Base",
  LENS = "Lens"
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
  token: LaunchpadToken; // associated token
  versions?: [string]; // versions of uri; only present in the db
};

/**
 * SmartMedia templates
 */
export enum TemplateName {
  ADVENTURE_TIME = "adventure_time",
  ARTIST_PRESENT = "artist_present",
}

/**
 * SmartMedia categories and templates
 */
export enum TemplateCategory {
  EVOLVING_POST = "evolving_post",
  EVOLVING_ART = "evolving_art",
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
  media?: SmartMedia,
  templateData?: unknown,
) => Promise<TemplateHandlerResponse | null>;

/**
 * Callback function type for handlers
 */
export interface TemplateHandlerResponse {
  preview?: {
    text: string;
    image?: string; // base64
    video?: string,
  };
  metadata?: TextOnlyMetadata | ImageMetadata | VideoMetadata; // only undefined on failure or generating preview
  updatedUri?: string, // in case the handler wants versioning on the media
  updatedTemplateData?: unknown, // updated payload for the next generation
}

export interface CreateTemplateRequestParams {
  templateName: TemplateName;
  category: TemplateCategory;
  templateData: unknown;
}