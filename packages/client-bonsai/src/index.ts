import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import { type Server as HttpServer, createServer } from "node:http";
import {
    settings,
    type Client,
    type IAgentRuntime,
    type UUID,
    elizaLogger,
} from "@elizaos/core";
import type { WrappedNodeRedisClient } from "handy-redis";
import type { Collection, MongoClient } from "mongodb";
import type { URI } from "@lens-protocol/metadata";
import { privateKeyToAccount } from "viem/accounts";
import { walletOnly } from "@lens-chain/storage-client";
import pkg from "lodash";
const { omit } = pkg;
import redisClient from "./services/redis";
import type {
    CreateTemplateRequestParams,
    LaunchpadToken,
    SmartMedia,
    SmartMediaBase,
    Template,
    TemplateName
} from "./utils/types";
import verifyLensId from "./middleware/verifyLensId";
import verifyApiKey from "./middleware/verifyApiKey";
import { getClient } from "./services/mongo";
import adventureTimeTemplate from "./templates/adventureTime";
import artistPresentTemplate from "./templates/artistPresent";
import TaskQueue from "./utils/taskQueue";
import createProfile from "./services/lens/createProfile";
import authenticate from "./services/lens/authenticate";
import { createPost, editPost } from "./services/lens/createPost";
import { refreshMetadataFor, refreshMetadataStatusFor } from "./services/lens/refreshMetadata";
import { formatSmartMedia } from "./utils/utils";
import { BONSAI_CLIENT_VERSION } from "./utils/constants";
import { LENS_CHAIN_ID } from "./services/lens/client";

/**
 * BonsaiClient provides an Express server for managing smart media posts on Lens Protocol.
 * It handles creation, updates, and management of dynamic NFT content.
 */
export class BonsaiClient {
    private app: express.Application;
    private server: HttpServer;

    private redis: WrappedNodeRedisClient;
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

                // generate the preview and cache it for the create step
                const response = await template.handler(runtime as IAgentRuntime, undefined, templateData);
                const media = formatSmartMedia(
                    creator,
                    category,
                    templateName,
                    response?.updatedTemplateData || templateData
                );
                await this.cachePreview(media);

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
                    token: LaunchpadToken,
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
                        response?.updatedTemplateData,
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
                    versions: [uri]
                });

                res.status(200).send(media);
            }
        );

        /**
         * GET /post/:postId
         * Retrieves the latest URI and metadata for a smart media post.
         *
         * @param {string} postId - Lens post ID
         * @param {boolean} withVersions - Optional flag to include version history
         * @returns {Object} Post URI, update timestamp, processing status, and optional version history
         * @throws {404} If post not found
         */
        this.app.get(
            "/post/:postId",
            async (req: express.Request, res: express.Response) => {
                const { postId } = req.params;
                const { withVersions } = req.query;
                const data = await this.getPost(postId as string);

                let versions: string[] | undefined;
                if (data) {
                    if (withVersions) {
                        const doc = await this.mongo.media?.findOne(
                            { postId },
                            { projection: { _id: 0, versions: { $slice: -10 } } }
                        );
                        versions = doc?.versions;
                    }

                    res.status(200).json({
                        uri: data.uri,
                        updatedAt: data.updatedAt,
                        // suggest clients to poll every 15s
                        processing: this.tasks.isProcessing(postId as string) ? true : undefined,
                        versions
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
         * @requires verifyApiKey middleware
         * @param {string} postId - Lens post ID
         * @returns {Object} Processing status
         * @throws {404} If post not found
         */
        this.app.post(
            "/post/:postId/update",
            verifyApiKey,
            async (req: express.Request, res: express.Response) => {
                const { postId } = req.params;

                if (this.tasks.isProcessing(postId)) {
                    res.status(204).json({ status: "processing" });
                    return;
                }

                const data = await this.getPost(postId as string);
                if (!data) {
                    res.status(404).send();
                    return;
                }

                this.tasks.add(postId, () => this.handlePostUpdate(postId));

                res.status(200).json({ status: "processing" });
            }
        );

        /**
         * POST /lens/profile/create
         * Test endpoint for creating new Lens profiles.
         *
         * @param {Object} req.body.username - Desired username
         * @param {Object} req.body.name - Profile display name
         * @param {Object} req.body.bio - Profile biography
         * @returns {Object} Created account details
         */
        this.app.post(
            "/lens/profile/create",
            async (req: express.Request, res: express.Response) => {
                const { username, name, bio } = req.body;

                const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
                const account = await createProfile(signer, username, { name, bio })

                res.status(200).json({ account });
            }
        );

        /**
         * POST /lens/post/create
         * Test endpoint for creating new Lens posts.
         *
         * @param {Object} req.body.text - Post content
         * @returns {Object} Created post details
         * @throws {500} If post creation fails
         */
        this.app.post(
            "/lens/post/create",
            async (req: express.Request, res: express.Response) => {
                const { text } = req.body;

                const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
                const sessionClient = await authenticate(signer, "bons_ai");

                const result = await createPost(sessionClient!, signer, { text });
                if (!result) {
                    res.status(500);
                }

                res.status(200).json(result);
            }
        );
    }

    /**
     * Handles the update process for a smart media post.
     * Generates new content, updates metadata, and refreshes the Lens post.
     *
     * @param {string} postId - Lens post ID
     * @returns {Promise<void>}
     */
    private async handlePostUpdate(postId: string): Promise<void> {
        const data = await this.getPost(postId as string);
        if (!data) return;

        // generate the next version of the post metadata
        const runtime = this.agents.get(process.env.GLOBAL_AGENT_ID as UUID);
        const template = this.templates.get(data.template);
        const response = await template?.handler(runtime as IAgentRuntime, data);
        if (!response?.metadata) {
            elizaLogger.error(`Failed to update post: ${postId}`);
            return;
        }

        // edit the post metadata using acl
        const success = await editPost(data.uri as string, response.metadata);
        if (!success) {
            elizaLogger.error("Failed to edit post metadata");
            return;
        }

        // update the cache with the latest template data needed for next generation
        await this.cachePost({
            ...data,
            templateData: response.updatedTemplateData || data.templateData,
            updatedAt: Math.floor(Date.now() / 1000)
        });

        // push the updated uri to the db for versioning
        if (response.updatedUri) {
            await this.mongo.media?.updateOne(
                { agentId: data.agentId },
                // @ts-ignore $push
                { $push: { versions: response.updatedUri as string } }
            );
        }

        // refresh the post metadata
        const jobId = await refreshMetadataFor(postId);
        const status = await refreshMetadataStatusFor(jobId as string);
        if (status === "FAILED") {
            elizaLogger.error("Failed to refresh post metadata");
            return;
        }
        elizaLogger.info(`submitted lens refresh metadata request: ${status}`);
        elizaLogger.info(`done updating post: ${postId}`);
    }

    /**
     * Initializes MongoDB connection and registers available templates.
     */
    private async initialize() {
        this.mongo = await getClient();

        // init templates
        for (const template of [adventureTimeTemplate, artistPresentTemplate]) {
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
                { projection: { _id: 0, versions: { $slice: -10 } } }
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

/**
 * Interface for integrating BonsaiClient with the ElizaOS system.
 */
export const BonsaiClientInterface: Client = {
    start: async (runtime: IAgentRuntime) => {
        console.log("BonsaiClientInterface:: start");
        const client = new BonsaiClient();

        client.registerAgent(runtime);
        client.start(Number.parseInt(settings.SERVER_PORT || "3001"));

        return client;
    },
    stop: async (_: IAgentRuntime) => {
        console.warn("BonsaiClientInterface:: warn:: does not support stopping yet");
    },
};

export default BonsaiClientInterface;
