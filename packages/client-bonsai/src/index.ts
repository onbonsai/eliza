import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import { type Server as HttpServer, createServer } from "node:http";
import {
    stringToUuid,
    settings,
    type Client,
    type IAgentRuntime,
    type UUID,
    elizaLogger,
} from "@elizaos/core";
import type { WrappedNodeRedisClient } from "handy-redis";
import type { Collection, MongoClient } from "mongodb";
import redisClient from "./services/redis";
import type { SmartMedia, SmartMediaPreview, Template, TemplateCategory, TemplateName } from "./utils/types";
import verifyLensId from "./middleware/verifyLensId";
import verifyApiKey from "./middleware/verifyApiKey";
import { DEFAULT_MAX_STALE_TIME } from "./utils/constants";
import { getClient } from "./services/mongo";
import adventureTimeTemplate from "./templates/adventureTime";
import TaskQueue from "./utils/taskQueue";
import createProfile from "./services/lens/createProfile";
import { privateKeyToAccount } from "viem/accounts";
import authenticate from "./services/lens/authenticate";
import { createPost } from "./services/lens/createPost";
import { fetchPostBy } from "./services/lens/posts";

// only needed to play nice with the rest of ElizaOS
const GLOBAL_AGENT_ID = "c3bd776c-4465-037f-9c7a-bf94dfba78d9";

export class BonsaiClient {
    private app: express.Application;
    private server: HttpServer;

    private redis: WrappedNodeRedisClient;
    private mongo: { client?: MongoClient, media?: Collection };

    private tasks: TaskQueue = new TaskQueue();
    private cache: Map<UUID, SmartMediaPreview> = new Map(); // agentId => preview
    private agents: Map<string, IAgentRuntime> = new Map();
    private templates: Map<TemplateName, Template> = new Map();

    constructor() {
        this.app = express();
        this.server = createServer(this.app);
        this.redis = redisClient;
        this.app.use(cors());
        this.mongo = {};

        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));

        this.initialize();

        // get a preview for the initial state of a smart media
        this.app.post(
            "/post/create-preview",
            verifyLensId,
            async (req: express.Request, res: express.Response) => {
                const creator = req.user?.sub as `0x${string}`;
                const {
                    category,
                    templateName,
                    templateData,
                    agentId,
                }: { templateName: TemplateName, category: TemplateCategory, templateData: unknown, agentId?: UUID } = req.body;

                // throttle to 1 generation per minute
                if (agentId) {
                    const lastUpdated = this.cache.get(agentId)?.updatedAt;
                    if (!lastUpdated) {
                        res.status(404);
                        return;
                    }
                    const currentTime = Math.floor(Date.now() / 1000);
                    if (currentTime - lastUpdated < 60) {
                        res.status(400).json({ error: "throttled; only 1 preview per minute" });
                        return;
                    }
                }

                const runtime = this.agents.get(GLOBAL_AGENT_ID);
                const template = this.templates.get(templateName);

                if (!template) {
                    res.status(400).json({ error: `templateName: ${templateName} not registered` });
                    return;
                }

                const response = await template.handler(runtime as IAgentRuntime, false, undefined, templateData);

                const ts = Math.floor(Date.now() / 1000);
                const preview: SmartMediaPreview = {
                    template: templateName,
                    category,
                    agentId: agentId || stringToUuid(`preview-${creator}`),
                    createdAt: ts,
                    updatedAt: ts,
                    creator,
                    templateData,
                    ...response,
                };

                await this.cachePreview(preview as SmartMediaPreview);

                res.status(200).json(preview);
            }
        );

        // create a new smart media; the creator _must_ have created the lens post first
        this.app.post(
            "/post/create",
            verifyLensId,
            async (req: express.Request, res: express.Response) => {
                const {
                    agentId,
                    postId,
                    uri,
                    tokenAddress,
                }: { agentId: UUID, postId: string, uri: string, tokenAddress: `0x${string}` } = req.body;

                // require that a preview was generated and cached
                const preview = this.cache.get(agentId as UUID);
                if (!preview) {
                    res.status(400).json({ error: "cache miss; please generate a new preview" })
                    return;
                }

                // prep the final object
                const ts = Math.floor(Date.now() / 1000);
                const media: SmartMedia = {
                    ...preview,
                    postId,
                    uri,
                    maxStaleTime: DEFAULT_MAX_STALE_TIME,
                    createdAt: ts,
                    updatedAt: ts,
                    tokenAddress,
                };

                // remove from memory cache, save in redis and mongo
                this.deletePreview(agentId);
                await this.cachePost(media);
                this.mongo.media?.insertOne({
                    ...media,
                    versions: [uri]
                });

                res.status(200);
            }
        );

        // returns the latest uri for a smart media for a given post id
        this.app.get(
            "/post/:postId",
            async (req: express.Request, res: express.Response) => {
                const { postId } = req.query;
                const data = await this.getPost(postId as string);

                // TODO: get db versions latest n versions, paginated

                if (data) {
                    res.status(200).json({
                        uri: data.uri,
                        updatedAt: data.updatedAt,
                        // suggest clients to poll every 15s
                        processing: this.tasks.isProcessing(postId as string) ? true : undefined,
                        versions: []
                    });
                } else {
                    res.status(404);
                }
            }
        );

        // trigger the update process for a given post; requires api key
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

                // TODO: call lens api to refresh metadata for postId

                res.status(200).json({ status: "processing" });
            }
        );

        // TEST ENDPOINT FOR CREATING PROFILES / POSTS
        this.app.post(
            "/lens/profile/create",
            async (req: express.Request, res: express.Response) => {
                const { username, name, bio } = req.body;

                const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
                const account = await createProfile(signer, username, { name, bio })

                res.status(200).json({ account });
            }
        );

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

                res.status(200).json({ ...result });
            }
        );
    }

    private async handlePostUpdate(postId: string): Promise<void> {
        const data = await this.getPost(postId as string);
        if (!data) return;

        const runtime = this.agents.get(GLOBAL_AGENT_ID);
        const template = this.templates.get(data.template);
        const response = await template?.handler(runtime as IAgentRuntime, true, data);

        if (!response?.uri) {
            elizaLogger.error(`Failed to update post: ${postId}`);
            return;
        }

        console.log(`response?.uri: ${response?.uri}`);

        // update the cache with the latest template data needed for next generation
        await this.cachePost({
            ...data,
            uri: response.uri,
            templateData: response.updatedTemplateData,
            updatedAt: Math.floor(Date.now() / 1000)
        });

        // push the new uri to the db for versioning
        await this.mongo.media?.updateOne(
            { agentId: data.agentId },
            // @ts-ignore $push
            { $push: { versions: response.uri as string } }
        );
    }

    private async initialize() {
        this.mongo = await getClient();

        // init templates
        for (const template of [adventureTimeTemplate]) {
            this.templates.set(template.name, template);
        };
    }

    public registerAgent(runtime: IAgentRuntime) {
        this.agents.set(runtime.agentId, runtime);
    }

    public cachePreview(data: SmartMediaPreview) {
        this.cache.set(data.agentId, data);
    }

    public deletePreview(agentId: UUID) {
        this.cache.delete(agentId);
    }

    public async cachePost(data: SmartMedia) {
        await this.redis.set(`post/${data.postId}`, JSON.stringify(data));
    }

    public async getPost(postId: string): Promise<SmartMedia | null> {
        const res = await this.redis.get(`post/${postId}`);

        if (!res) {
            const doc = await this.mongo.media?.findOne({ postId }, { projection: { _id: 0 } });
            return doc as unknown as SmartMedia;
        }

        return JSON.parse(res);
    }

    public start(port: number) {
        this.server.listen(port, () => {
            console.log(
                `BonsaiClient server running on http://localhost:${port}/`
            );
        });
    }
}

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
