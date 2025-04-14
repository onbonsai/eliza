import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import { type Server as HttpServer, createServer } from "node:http";
import { Server as SocketIOServer, type ServerOptions } from "socket.io";
import {
  settings,
  type IAgentRuntime,
  type Plugin,
  Service,
  elizaLogger,
  ServiceType,
  stringToUuid,
  type UUID,
  type Content,
  type Memory,
  type State,
  composeContext,
  generateMessageResponse,
  ModelClass,
  getModelSettings,
} from "@elizaos/core";
import type { Collection, MongoClient } from "mongodb";
import type Redis from "ioredis";
import redisClient from "./services/redis";
import type {
  SmartMedia,
} from "@elizaos/client-bonsai";
import { getClient, initCollections } from "./services/mongo";
import type { Payload } from "./utils/types";
import verifyLensId from "./middleware/verifyLensId";
import { getAddress } from "viem";
import { messageHandlerTemplate } from "./utils/messageTemplates";
import { fetchPost } from "@lens-protocol/client/actions";
import { client } from "./services/lens/client";
import { type Post, postId } from "@lens-protocol/client";
import { fetchAllCommentsFor, fetchPostsBy } from "./services/lens/posts";
import { formatPost } from "./utils/utils";
import { getWallets } from "./services/coinbase";
import { decrementCredits, getCreditsForMessage, getCredits } from "./utils/apiCredits";

/**
 * BonsaiTerminalClient provides an Express server for interacting wtih smart media.
 */
class BonsaiTerminalClient {
  private app: express.Application;
  private server: HttpServer;
  private io: SocketIOServer;

  private redis: Redis;
  private mongo: { client?: MongoClient, media?: Collection };

  private agents: Map<string, IAgentRuntime> = new Map();

  private DEFAULT_MODEL_ID = "gpt-4o-mini";

  /**
   * Initializes a new BonsaiClient instance with Express server, Redis, and MongoDB connections.
   * Sets up CORS, body parsing, and required middleware.
   */
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.redis = redisClient;
    this.io = new SocketIOServer<ServerOptions>(this.server, {
      cors: { origin: "*", methods: ["GET", "POST"] },
    });
    this.app.use(cors());
    this.mongo = {};

    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));

    this.initialize();

    // allows an authenticated lens account to message a smart media post
    this.app.post(
      "/post/:postId/message",
      verifyLensId,
      async (req: express.Request, res: express.Response) => {
        const _postId = req.params.postId;
        const user = req.user?.sub as `0x${string}`;
        const accountAddress = getAddress(req.user?.act?.sub as `0x${string}`);
        const roomId = req.body.roomId || stringToUuid(`${_postId}-${accountAddress}`);
        const userId = stringToUuid(accountAddress);
        const payload: Payload = req.body.payload; // action, image, action presets

        const runtime = this.agents.get(process.env.GLOBAL_AGENT_ID as UUID);

        if (!runtime) {
          res.status(404).send("Agent not found");
          return;
        }

        await runtime.ensureConnection(
          userId,
          roomId,
          req.body.userName,
          req.body.name,
          "bonsai-terminal"
        );

        let creditsRemaining = await getCredits(user);
        const canMessage = creditsRemaining >= getCreditsForMessage(this.DEFAULT_MODEL_ID);
        if (!canMessage) {
          res.status(403).send("Not enough credits");
          return;
        }

        const text = req.body.text;
        const messageId = stringToUuid(Date.now().toString());

        const content: Content = {
          text,
          attachments: [],
          source: "bonsai-terminal",
          inReplyTo: undefined,
        };

        const userMessage = {
          content,
          userId,
          roomId,
          agentId: runtime.agentId,
        };

        const memory: Memory = {
          id: messageId,
          agentId: runtime.agentId,
          userId,
          roomId,
          content,
          createdAt: Date.now(),
        };

        await runtime.messageManager.createMemory(memory);

        const state = (await runtime.composeState(userMessage, {
          agentName: runtime.character.name,
        })) as State;

        const post = await fetchPost(client, { post: postId(_postId) });
        if (!post.isOk()) {
          res.status(404).json({ error: "failed to fetch post" });
          return;
        }
        state.postContent = (post.value as Post).metadata.content;
        // TODO: sort by user score or engagement and take top 10
        state.postComments = (await fetchAllCommentsFor(_postId)).slice(0, 10).map((c) => formatPost(c)).join("\n");
        state.authorPosts = (await fetchPostsBy(post.value?.author.address)).value?.items.map((p) => formatPost(p)).join("\n");
        state.payload = payload;

        const context = composeContext({
          state,
          template: messageHandlerTemplate,
        });

        const modelClass = ModelClass.SMALL;
        const { response, usage } = await generateMessageResponse({
          runtime: runtime,
          context,
          modelClass,
          returnUsage: true,
        }) as { response: Content, usage: any };
        const modelSettings = getModelSettings(runtime.modelProvider, modelClass);
        creditsRemaining = await decrementCredits(
          user,
          modelSettings?.name || this.DEFAULT_MODEL_ID,
          { input: usage?.promptTokens || 0, output: usage?.completionTokens || 0 },
          usage?.imagesCreated || 0
        ) as number;

        // save response to memory
        const responseMessage = {
          ...userMessage,
          userId: runtime.agentId,
          content: response as Content,
        };

        await runtime.messageManager.createMemory(responseMessage);

        if (!response) {
          res.status(500).send(
            "No response from generateMessageResponse"
          );
          return;
        }

        await runtime.evaluate(memory, state);

        const canMessageAgain = creditsRemaining >= getCreditsForMessage(modelSettings?.name as string);

        res.json({ messages: [response], canMessageAgain });

        await runtime.processActions(
          memory,
          [responseMessage],
          state,
          async (newMessage) => {
            // doing this to skip duplicate messages
            // TODO: maybe handle video too
            if (newMessage.action === "GENERATE_IMAGE") {
              return [memory];
            }

            console.log("emitting to roomId", roomId);
            this.io.to(roomId).emit(
              "response",
              JSON.stringify({
                text: newMessage.text,
                attachments: newMessage.attachments,
                action: "NONE",
              })
            );

            return [memory];
          }
        );
      }
    );

    // allows an authenticated lens account to fetch their messages for a given post
    this.app.get(
      "/post/:postId/messages",
      verifyLensId,
      async (req: express.Request, res: express.Response) => {
        const _postId = req.params.postId;
        const user = req.user?.sub as `0x${string}`;
        const accountAddress = getAddress(req.user?.act?.sub as `0x${string}`);
        const roomId = req.query.roomId || stringToUuid(`${_postId}-${accountAddress}`);

        const runtime = this.agents.get(process.env.GLOBAL_AGENT_ID as UUID);
        if (!runtime) {
          res.status(404).send("Agent not found");
          return;
        }
        const userId = stringToUuid(accountAddress);
        await runtime.ensureConnection(
          userId,
          roomId as UUID,
          req.body.userName,
          req.body.name,
          "bonsai-terminal"
        );
        const messages = await runtime.messageManager.getMemories({ roomId: roomId as UUID });
        const creditsRemaining = await getCredits(user);
        const canMessage = creditsRemaining >= getCreditsForMessage(this.DEFAULT_MODEL_ID);
        res.status(200).json({ messages, canMessage });
      }
    );

    // get agent info
    this.app.get(
      "/agent/:agentId/info",
      async (req: express.Request, res: express.Response) => {
        const { agentId } = req.params;
        if (!agentId) {
          res.status(400).send();
          return;
        }

        let wallets: string[] = [];
        const _wallets = await getWallets(agentId);
        if (_wallets) {
          const [polygon] = await _wallets.polygon.listAddresses();
          const [base] = await _wallets.base.listAddresses();
          wallets = [polygon.getId(), base.getId()];
        }

        res.status(200).json({
          wallets,
          account: {
            address: "0xb39d0E00474E5A8ab72Ab3Ea0cfE5e49A1F75aB7",
            username: "bons_ai"
          }
        });
      }
    );
  }

  /**
   * Initializes MongoDB connection and registers available templates.
   */
  private async initialize() {
    await initCollections();
    this.mongo = await getClient();
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
        `BonsaiTerminal server running on http://localhost:${port}/`
      );
    });
  }
}

export class BonsaiTerminalService extends Service {
  static serviceType = ServiceType.NKN_CLIENT_SERVICE;
  static async initialize() { }

  capabilityDescription = 'Direct interface with smart media';

  constructor(protected runtime: IAgentRuntime) {
    super();
  }

  async initialize(): Promise<void> { }

  static async start(runtime: IAgentRuntime): Promise<BonsaiTerminalService> {
    console.log("BonsaiTerminalService:: start");
    const service = new BonsaiTerminalService(runtime);
    const client = new BonsaiTerminalClient();

    client.registerAgent(runtime);
    client.start(Number.parseInt(settings.BONSAI_TERMINAL_PORT || "3002"));

    return service;
  }

  async stop(): Promise<void> {
    console.log("BonsaiTerminalService:: stop");
  }

  async sendMessage(): Promise<void> { }
};