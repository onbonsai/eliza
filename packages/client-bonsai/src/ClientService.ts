import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import { type Server as HttpServer, createServer } from "node:http";
import {
  settings,
  type IAgentRuntime,
  type UUID,
  Service,
  elizaLogger,
  ServiceType,
} from "@elizaos/core";
import type Redis from "ioredis";
import type { Collection, MongoClient } from "mongodb";
import type { URI } from "@lens-protocol/metadata";
import { immutable, walletOnly } from "@lens-chain/storage-client";
import redisClient from "./services/redis";
import {
  type CreateTemplateRequestParams,
  type LaunchpadToken,
  type SmartMedia,
  type SmartMediaBase,
  SmartMediaStatus,
  type Template,
  type TemplateName
} from "./utils/types";
import verifyLensId from "./middleware/verifyLensId";
import verifyApiKeyOrLensId from "./middleware/verifyApiKeyOrLensId";
import { getClient, initCollections } from "./services/mongo";
import adventureTimeTemplate from "./templates/adventureTime";
import evolvingArtTemplate from "./templates/evolvingArt";
import infoAgentTemplate from "./templates/infoAgent";
import TaskQueue from "./utils/taskQueue";
import { editPost } from "./services/lens/createPost";
import { refreshMetadataFor, refreshMetadataStatusFor } from "./services/lens/refreshMetadata";
import { formatSmartMedia } from "./utils/utils";
import { BONSAI_CLIENT_VERSION, DEFAULT_FREEZE_TIME, LENS_BONSAI_APP, LENS_BONSAI_DEFAULT_FEED } from "./utils/constants";
import { client, LENS_CHAIN, LENS_CHAIN_ID } from "./services/lens/client";
import { canUpdate, decrementCredits, DEFAULT_MODEL_ID } from "./utils/apicredits";
import { privateKeyToAccount } from "viem/accounts";
import { authenticateAsBuilder } from "./services/lens/authenticate";
import { createWalletClient, http } from "viem";
import { createAccountWithUsername, createApp, createFeed, setDefaultAppFeed } from "@lens-protocol/client/actions";
import { evmAddress, uri } from "@lens-protocol/client";
import { handleOperationWith } from "@lens-protocol/client/viem";
import { chains } from "@lens-chain/sdk/viem";
import { MetadataAttributeType, account, app, feed } from "@lens-protocol/metadata";
import { storageClient } from "./services/lens/client";
import { fetchPostById } from "./services/lens/posts";

/**
 * BonsaiClient provides an Express server for managing smart media posts on Lens Protocol.
 * It handles creation, updates, and management of dynamic NFT content.
 */
class BonsaiClient {
  private app: express.Application;
  private server: HttpServer;

  private redis: Redis;
  private mongo: { client?: MongoClient, media?: Collection };

  private tasks: TaskQueue = new TaskQueue();
  private cache: Map<UUID, SmartMediaBase> = new Map(); // agentId => preview
  private agents: Map<string, IAgentRuntime> = new Map();
  private templates: Map<TemplateName, Template> = new Map();

  /**
   * Initializes a new BonsaiClient instance with Express server, Redis, and MongoDB connections.
   * Sets up CORS, body parsing, and required middleware.
   */
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.redis = redisClient;
    this.app.use(cors());
    this.mongo = {};

    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));

    this.initialize();

    /**
     * GET /metadata
     * Retrieves the configuration for this eliza server including server domain, registered template metadata,
     * bonsai client version, and storage acl
     * @returns {Object} domain, version, templates, acl
     */
    this.app.get(
      "/metadata",
      async (_: express.Request, res: express.Response) => {
        const templates = Array.from(this.templates.values()).map(template => ({
          ...template.clientMetadata,
          templateData: {
            ...template.clientMetadata.templateData,
            form: template.clientMetadata.templateData.form.shape // serialize the zod object
          }
        }));
        res.status(200).json({
          domain: process.env.DOMAIN as string,
          version: BONSAI_CLIENT_VERSION,
          templates,
          acl: walletOnly(process.env.LENS_STORAGE_NODE_ACCOUNT as `0x${string}`, LENS_CHAIN_ID)
        })
      }
    );

    // TODO: use socketio logic from client-orb with try... catch and ws emit
    // TODO: handle credits
    /**
     * POST /post/create-preview
     * Generates a preview for a new smart media post before creation.
     *
     * @requires verifyLensId middleware
     * @param {Object} req.body.category - Template category
     * @param {Object} req.body.templateName - Name of template to use
     * @param {Object} req.body.templateData - Data to populate the template
     * @returns {Object} Preview data with agentId, preview content
     * @throws {400} If template is not registered
     */
    this.app.post(
      "/post/create-preview",
      verifyLensId,
      async (req: express.Request, res: express.Response) => {
        const creator = req.user?.sub as `0x${string}`;
        const { category, templateName, templateData }: CreateTemplateRequestParams = req.body;

        const runtime = this.agents.get(process.env.GLOBAL_AGENT_ID as UUID);
        const template = this.templates.get(templateName);
        if (!template) {
          res.status(400).json({ error: `templateName: ${templateName} not registered` });
          return;
        }

        // check if user has enough credits
        if (!await canUpdate(creator, templateName)) {
          res.status(403).json({ error: `not enough credits to generate preview for: ${templateName}` });
          return;
        }

        // generate the preview and cache it for the create step
        const response = await template.handler(runtime as IAgentRuntime, undefined, templateData);
        const media = formatSmartMedia(
          creator,
          category,
          templateName,
          response?.updatedTemplateData || templateData
        );
        await this.cachePreview(media);

        // decrement user credits
        const totalUsage = response?.totalUsage;
        await decrementCredits(creator, template?.clientMetadata.defaultModel || DEFAULT_MODEL_ID, { input: totalUsage?.promptTokens || 0, output: totalUsage?.completionTokens || 0 }, totalUsage?.imagesCreated || 0);

        res.status(200).json({ agentId: media.agentId, preview: response?.preview });
      }
    );

    /**
     * POST /post/create
     * Creates a new smart media post after the Lens post has been created.
     *
     * @requires verifyLensId middleware
     * @param {Object} req.body.agentId - Optional ID from preview
     * @param {Object} req.body.params - Optional creation parameters if no preview
     * @param {string} req.body.postId - Lens post ID
     * @param {string} req.body.uri - Uri (lens storage) of the post metadata, with ACL set to walletOnly(process.env.LENS_STORAGE_NODE_ACCOUNT)
     * @param {Object} req.body.token - Associated launchpad token
     * @returns {Object} Created smart media object
     * @throws {400} If neither agentId nor params are provided
     * @throws {400} If preview not found for agentId
     */
    this.app.post(
      "/post/create",
      verifyLensId,
      async (req: express.Request, res: express.Response) => {
        const creator = req.user?.sub as `0x${string}`;
        const {
          agentId,
          params,
          postId,
          uri,
          token
        }: {
          agentId?: UUID,
          params?: CreateTemplateRequestParams,
          postId: string,
          uri: URI,
          token?: LaunchpadToken,
        } = req.body;

        let media: SmartMedia;
        if (agentId) {
          const preview = this.cache.get(agentId as UUID);
          if (!preview) {
            res.status(400).json({ error: "preview not found" });
            return;
          }
          media = formatSmartMedia(
            creator,
            preview.category,
            preview.template,
            preview.templateData,
            postId,
            uri,
            token
          ) as SmartMedia;

          this.deletePreview(agentId); // remove from memory cache
        } else if (params) {
          const runtime = this.agents.get(process.env.GLOBAL_AGENT_ID as UUID);
          const template = this.templates.get(params.templateName);
          if (!template) {
            res.status(400).json({ error: `templateName: ${params.templateName} not registered` });
            return;
          }

          const response = await template.handler(runtime as IAgentRuntime, undefined, params.templateData);
          media = formatSmartMedia(
            creator,
            params.category,
            params.templateName,
            response?.updatedTemplateData || params.templateData,
            postId,
            uri,
            token
          ) as SmartMedia;
        } else {
          res.status(400).json({ error: "missing agentId or params" });
          return;
        }

        await this.cachePost(media);
        this.mongo.media?.insertOne({
          ...media,
          versions: [],
          status: SmartMediaStatus.ACTIVE,
        });

        res.status(200).send(media);
      }
    );

    /**
     * GET /post/:postId
     * Retrieves all persisted data for a smart media post.
     *
     * @param {string} postId - Lens post ID
     * @param {boolean} withVersions - Optional flag to include version history
     * @returns {Object} Post URI, update timestamp status, , and optional versions
     * @throws {404} If post not found
     */
    this.app.get(
      "/post/:postId",
      async (req: express.Request, res: express.Response) => {
        const { postId } = req.params;
        const { withVersions } = req.query;
        const data = await this.getPost(postId as string);

        if (data) {
          let versions: string[] | undefined = data.versions;
          let status: SmartMediaStatus | undefined = data.status;

          if (withVersions && !(versions || status)) {
            const doc = await this.mongo.media?.findOne(
              { postId },
              { projection: { _id: 0, versions: { $slice: -10 }, status: 1 } }
            );
            versions = doc?.versions;
            status = doc?.status;
          }

          res.status(200).json({
            ...data,
            isProcessing: this.tasks.isProcessing(postId as string),
            versions,
            protocolFeeRecipient: this.templates.get(data.template)?.clientMetadata.protocolFeeRecipient,
            status,
          });
        } else {
          res.status(404).send();
        }
      }
    );

    /**
     * POST /post/:postId/update
     * Triggers an update process for a smart media post.
     *
     * @requires verifyApiKeyOrLensId middleware
     * @param {string} postId - Lens post ID
     * @returns {Object} Processing status
     * @throws {404} If post not found
     */
    this.app.post(
      "/post/:postId/update",
      verifyApiKeyOrLensId,
      async (req: express.Request, res: express.Response) => {
        const { postId } = req.params;
        const { forceUpdate } = req.body;

        if (this.tasks.isProcessing(postId)) {
          res.status(204).json({ status: "processing" });
          return;
        }

        const data = await this.getPost(postId as string);
        if (!data) {
          res.status(404).send();
          return;
        }

        if (forceUpdate && (data.creator !== req.user?.sub as `0x${string}`)) {
          res.status(401).json({ error: "only post creator can force update" });
          return;
        }

        console.log(`adding post to queue: ${postId}`);
        this.tasks.add(postId, () => this.handlePostUpdate(postId, forceUpdate));

        res.status(200).json({ status: "processing" });
      }
    );

    /**
     * POST /post/:postId/disable
     * Allows a creator to disable their smart media post
     *
     * @requires verifyLensId middleware
     * @param {string} postId - Lens post ID
     * @returns {Object} Processing status
     * @throws {404} If post not found
     */
    this.app.post(
      "/post/:postId/disable",
      verifyLensId,
      async (req: express.Request, res: express.Response) => {
        const { postId } = req.params;

        const data = await this.getPost(postId as string);
        if (!data) {
          res.status(404).send();
          return;
        }

        if (data.creator !== req.user?.sub as `0x${string}`) {
          res.status(401).json({ error: "only post creator can disable" });
          return;
        }

        elizaLogger.log(`freezing post: ${postId}`);
        // freeze the post to disable updates; remove from cache
        await this.mongo.media?.updateOne({ postId }, { $set: { status: SmartMediaStatus.DISABLED } });
        await this.removePostFromCache(data);

        res.status(200).json();
      }
    );

    /**
     * GET /post/:postId/canvas
     * Returns the HTML Canvas (if any)  for a given postId
     *
     * @param {string} postId - Lens post ID
     * @returns {Object} HTML canvas
     */
    this.app.get(
      "/post/:postId/canvas",
      async (req: express.Request, res: express.Response) => {
        const { postId } = req.params;

        const post = await this.getPost(postId as string);
        const canvasHtml = post?.canvas;

        if (!canvasHtml) {
          res.status(404).send();
          return;
        }

        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(canvasHtml);
      }
    );

    // TEST ENDPOINT FOR LENS APP / FEED / PROFILE
    this.app.post(
      "/test/lens/create",
      async (req: express.Request, res: express.Response) => {
        const signer = privateKeyToAccount(process.env.PERSONAL_PRIVATE_KEY as `0x${string}`);
        const sessionClient = await authenticateAsBuilder(signer);

        const walletClient = createWalletClient({
          chain: LENS_CHAIN,
          account: signer,
          transport: http()
        });

        // const metadata = app({
        //     name: "Bonsai",
        //     tagline: "Create autonomous, agentic content on Lens",
        //     description: "An app to rule them all",
        //     logo: "lens://4f91cab87ab5e4f5066f878b72…",
        //     developer: "John Doe <john.doe@email.com>",
        //     url: "https://example.com",
        //     termsOfService: "https://example.com/terms",
        //     privacyPolicy: "https://example.com/privacy",
        //     platforms: ["web"],
        // });

        // const { uri: appUri } = await storageClient.uploadAsJson(metadata, { acl: immutable(LENS_CHAIN_ID) });
        // const _app = await createApp(sessionClient, {
        //     metadataUri: uri(appUri),
        //     defaultFeed: {
        //         globalFeed: true,
        //     },
        //     graph: {
        //         globalGraph: true,
        //     },
        //     namespace: {
        //         globalNamespace: true,
        //     },
        // }).andThen(handleOperationWith(walletClient));
        // console.log(_app);

        // const metadata = feed({
        //     name: "Bonsai Feed",
        //     description: "Custom feed for agentic content on Bonsai",
        // });
        // const { uri: feedUri } = await storageClient.uploadAsJson(metadata, { acl: immutable(LENS_CHAIN_ID) });
        // const result = await createFeed(sessionClient, {
        //     metadataUri: uri(feedUri),
        // }).andThen(handleOperationWith(walletClient));

        // const result = await setDefaultAppFeed(sessionClient, {
        //     feed: { custom: evmAddress(LENS_BONSAI_DEFAULT_FEED) },
        //     app: evmAddress(LENS_BONSAI_APP),
        // }).andThen(handleOperationWith(walletClient));

        // const authenticated = await client.login({
        //     onboardingUser: {
        //         app: LENS_BONSAI_APP,
        //         wallet: signer.address,
        //     },
        //     signMessage: (message) => signer.signMessage({ message }),
        // });
        // const sessionClient = authenticated.value;
        // const metadata = account({
        //     name: "Carlos",
        //     bio: "testing tester",
        // });
        // const { uri: accountUri } = await storageClient.uploadAsJson(metadata, { acl: immutable(LENS_CHAIN_ID) });
        // const result = await createAccountWithUsername(sessionClient, {
        //     username: { localName: "carlosbeltran" },
        //     metadataUri: uri(accountUri),
        // }).andThen(handleOperationWith(walletClient));

        // console.log(result);

        res.status(200).send();
      }
    );
  }

  /**
   * Handles the update process for a smart media post.
   * Generates new content, updates metadata, and refreshes the Lens post.
   * If a post is not updated after enough checks, we freeze it to avoid future checks from the cron job
   *
   * @param {string} postId - Lens post ID
   * @param {boolean} forceUpdate - If the update should be forced
   * @returns {Promise<void>}
   */
  private async handlePostUpdate(postId: string, forceUpdate?: boolean): Promise<void> {
    console.log(`handlePostUpdate: ${postId}, forceUpdate => ${forceUpdate || false}`);
    const data = await this.getPost(postId as string);
    if (!data) {
      console.log("no data found");
      return;
    }

    const runtime = this.agents.get(process.env.GLOBAL_AGENT_ID as UUID);
    const template = this.templates.get(data.template);

    if (!template) {
      elizaLogger.error("Template not registered");
      return;
    }

    // check if the post has been deleted
    const post = await fetchPostById(postId);
    if (post?.isDeleted) {
      elizaLogger.log(`post is deleted, freezing post: ${postId}`);
      await this.mongo.media?.updateOne({ postId }, { $set: { status: SmartMediaStatus.DISABLED } });
      await this.removePostFromCache(data);
      return;
    }

    // check if user has enough credits
    if (!await canUpdate(data.creator, data.template)) {
      elizaLogger.error(`not enough credits for post: ${postId}`);
      return;
    }

    // generate the next version of the post metadata
    elizaLogger.info(`invoking ${data.template} handler for post: ${postId}`, data);
    console.log("template", template)
    const response = await template?.handler(runtime as IAgentRuntime, data, undefined, { forceUpdate });

    // no response means template failed
    if (!response) {
      elizaLogger.error(`handler failed, no response for post: ${postId}`);

      // freeze the post to skip future checks; remove from cache
      if ((Math.floor(Date.now() / 1000)) - data.updatedAt > DEFAULT_FREEZE_TIME) {
        elizaLogger.log(`freezing post: ${postId}`);
        await this.mongo.media?.updateOne({ postId }, { $set: { status: SmartMediaStatus.FAILED } });
        await this.removePostFromCache(data);
      }
      return;
    }

    const needsStatusUpdate = data.status === SmartMediaStatus.DISABLED || data.status === SmartMediaStatus.FAILED;
    const hasNewVersion = !!response.persistVersionUri;

    // Update database if we need to update status or have a new version
    if (needsStatusUpdate || hasNewVersion) {
      const update: any = {};
      if (hasNewVersion) {
        update.$push = { versions: response.persistVersionUri as string };
      }
      if (needsStatusUpdate) {
        update.$set = { status: SmartMediaStatus.ACTIVE };
      }
      console.log("update", update);
      await this.mongo.media?.updateOne({ postId }, update);
    }

    // decrement user credits
    const totalUsage = response?.totalUsage;
    await decrementCredits(data.creator, template?.clientMetadata.defaultModel || DEFAULT_MODEL_ID, { input: totalUsage?.promptTokens || 0, output: totalUsage?.completionTokens || 0 }, totalUsage?.imagesCreated || 0);

    // no metadata means nothing to update on the post
    if (!response?.metadata) {
      elizaLogger.log(`no metadata, skipping update for post: ${postId}`);
      return;
    }

    // refresh the post metadata
    if (response.metadata) {
      const jobId = await refreshMetadataFor(postId);
      const status = await refreshMetadataStatusFor(jobId as string);
      elizaLogger.info(`submitted lens refresh metadata request: ${jobId} => ${status}`);
      if (status === "FAILED") {
        elizaLogger.error("Failed to refresh post metadata");
        await this.mongo.media?.updateOne({ postId }, { $set: { status: SmartMediaStatus.FAILED } });
        return;
      }
    }

    // update the cache with the latest template data needed for next generation (if any)
    await this.cachePost({
      ...data,
      templateData: response.updatedTemplateData || data.templateData,
      updatedAt: Math.floor(Date.now() / 1000),
      // HACK: make sure we dont save these in redis
      versions: undefined,
      status: undefined,
    });

    elizaLogger.info(`done updating post: ${postId}`);
  }

  /**
   * Initializes MongoDB connection and registers available templates.
   */
  private async initialize() {
    await initCollections();
    this.mongo = await getClient();

    // init templates
    for (const template of [adventureTimeTemplate, evolvingArtTemplate, infoAgentTemplate]) {
      this.templates.set(template.clientMetadata.name, template);
    };
  }

  /**
   * Registers an agent runtime for template processing.
   *
   * @param {IAgentRuntime} runtime - Agent runtime to register
   */
  public registerAgent(runtime: IAgentRuntime) {
    this.agents.set(runtime.agentId, runtime);
  }

  /**
   * Caches a preview of smart media before post creation.
   *
   * @param {SmartMediaBase} data - Preview data to cache
   */
  public cachePreview(data: SmartMediaBase) {
    this.cache.set(data.agentId, data);
  }

  /**
   * Removes a preview from the cache.
   *
   * @param {UUID} agentId - ID of preview to delete
   */
  public deletePreview(agentId: UUID) {
    this.cache.delete(agentId);
  }

  /**
   * Caches post data in Redis.
   *
   * @param {SmartMedia} data - Post data to cache
   */
  public async cachePost(data: SmartMedia) {
    await this.redis.set(`post/${data.postId}`, JSON.stringify(data));
  }

  /**
   * Caches post data in Redis.
   *
   * @param {SmartMedia} data - Post data to cache
   */
  public async removePostFromCache(data: SmartMedia) {
    await this.redis.del(`post/${data.postId}`);
  }

  /**
   * Retrieves post data from Redis or MongoDB.
   *
   * @param {string} postId - Lens post ID
   * @returns {Promise<SmartMedia | null>} Post data or null if not found
   */
  public async getPost(postId: string): Promise<SmartMedia | null> {
    const res = await this.redis.get(`post/${postId}`);

    if (!res) {
      const doc = await this.mongo.media?.findOne(
        { postId },
        {
          projection: {
            _id: 0,
            versions: { $slice: -10 } // only last 10 versions
          }
        }
      );
      return doc as unknown as SmartMedia;
    }

    return JSON.parse(res);
  }

  /**
   * Starts the Express server on the specified port.
   *
   * @param {number} port - Port number to listen on
   */
  public start(port: number) {
    this.server.listen(port, () => {
      console.log(
        `BonsaiClient server running on http://localhost:${port}/`
      );
    });
  }
}

export class BonsaiClientService extends Service {
  static serviceType = ServiceType.NKN_CLIENT_SERVICE;
  static async initialize() { }

  capabilityDescription = 'Implements the Smart Media Protocol';

  constructor(protected runtime: IAgentRuntime) {
    super();
  }

  async initialize(): Promise<void> { }

  static async start(runtime: IAgentRuntime): Promise<BonsaiClientService> {
    console.log("BonsaiClientService:: start");
    const service = new BonsaiClientService(runtime);
    const client = new BonsaiClient();

    client.registerAgent(runtime);
    client.start(Number.parseInt(settings.BONSAI_SMP_PORT || "3001"));

    return service;
  }

  async stop(): Promise<void> {
    console.log("BonsaiClientService:: stop");
  }

  async sendMessage(content: string, channelId: string): Promise<void> { }
};