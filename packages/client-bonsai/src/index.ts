import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import { type Server as HttpServer, createServer } from "node:http";
import { Server as SocketIOServer, type ServerOptions } from "socket.io";
import {
    composeContext,
    generateMessageResponse,
    messageCompletionFooter,
    stringToUuid,
    settings,
    ModelProviderName,
    ModelClass,
    Clients,
    type Content,
    type Memory,
    type State,
    type Client,
    type IAgentRuntime,
    type UUID,
    type AgentRuntime,
} from "@elizaos/core";
import { isAddress } from "viem";
import parseJwt from "./services/lens/parseJwt";

export const messageHandlerTemplate =
    `# Action Examples
{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Task: Generate dialog and actions for the character {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

{{providers}}

{{attachments}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

{{messageDirections}}

{{recentMessages}}

{{actions}}

# Instructions: Write a response to the most recent message as {{agentName}}. Ignore "action". Don't say anything similar to a previous conversation message, make each thought fresh and unique. avoid responding with platitudes.
NO EMOJIS. don't take yourself to seriously, don't say 'ah' or 'oh', be brief and concise.
` + messageCompletionFooter;

export interface Payload {
    action: string;
    data: { [key: string]: string };
}
export class BonsaiClient {
    private app: express.Application;
    private server: HttpServer;
    private io: SocketIOServer;
    private agents: Map<string, AgentRuntime>;
    private responded: Record<string, boolean>;

    constructor() {
        console.log("BonsaiClient constructor");
        this.app = express();
        this.server = createServer(this.app);
        this.io = new SocketIOServer<ServerOptions>(this.server, {
            cors: { origin: "*", methods: ["GET", "POST"] },
        });
        this.app.use(cors());
        this.agents = new Map();
        this.responded = {};

        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));

        this.initializeWebSocket();

        // GENERAL ENTRY POINT
        this.app.get(
            "post/:agentId",
            async (req: express.Request, res: express.Response) => {
                const agentId = req.params.agentId;
                const roomId = stringToUuid(`post-${agentId}`);
                const userId = stringToUuid(req.query.userProfileId ?? "user");

                let runtime = this.agents.get(agentId);

                // if runtime is null, look for runtime with the same name
                if (!runtime) {
                    runtime = Array.from(this.agents.values()).find(
                        (a) =>
                            a.character.name.toLowerCase() ===
                            agentId.toLowerCase()
                    );
                }

                if (!runtime) {
                    res.status(404).send("Agent not found");
                    return;
                }

                await runtime.ensureConnection(
                    userId,
                    roomId,
                    req.body.userName,
                    req.body.name,
                    "direct"
                );

                const text = req.body.text;
                const messageId = stringToUuid(Date.now().toString());

                const content: Content = {
                    text,
                    attachments: [],
                    source: "direct",
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

                // for bonsai plugin
                state.payload = {
                    ...payload,
                    imageURL,
                    userId: req.body.userId,
                    creatorAddress: req.body.userId
                        ? isAddress(req.body.userId)
                            ? req.body.userId
                            : undefined
                        : undefined,
                };

                const context = composeContext({
                    state,
                    template: messageHandlerTemplate,
                });

                const response = await generateMessageResponse({
                    runtime: runtime,
                    context,
                    modelClass: ModelClass.SMALL,
                });

                // save response to memory
                const responseMessage = {
                    ...userMessage,
                    userId: runtime.agentId,
                    content: response,
                };

                await runtime.messageManager.createMemory(responseMessage);

                if (!response) {
                    res.status(500).send(
                        "No response from generateMessageResponse"
                    );
                    return;
                }

                await runtime.evaluate(memory, state);

                res.json([response]);

                // set the adminProfileId to be able to post to orb
                const token = req.headers["lens-access-token"] as string;
                if (token) {
                    const { id: adminProfileId } = parseJwt(token);
                    state.adminProfileId = adminProfileId;
                }

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

        // CREATE A POST
        // this.app.post(
        //     "post/create",
        //     async (req: express.Request, res: express.Response) => {
        //         // verify lens jwt token
        //         const { fundTxHash } = req.body;
        //         const { handle } = req.params;
        //         const agentId = uuid();
        //         const token = req.headers["lens-access-token"] as string;
        //         if (!token) {
        //             res.status(401).send("Lens access token is required");
        //             return;
        //         }
        //         const { id: adminProfileId } = parseJwt(token);
        //         if (!adminProfileId) {
        //             res.status(403).send("Invalid access token");
        //             return;
        //         }

        //         if (!handle) {
        //             res.status(400).send("handle is required");
        //             return;
        //         }

        //         const wallets = await getWallets(agentId, true);
        //         if (!wallets?.polygon)
        //             res.status(500).send("failed to load polygon wallet");

        //         // TODO: verify `fundTxHash` was sent to this polygon wallet with value = 8 pol

        //         try {
        //             // mints the profile with agentId as the handle, if not already taken
        //             const { profileId, txHash } = await mintProfile(
        //                 wallets!.polygon,
        //                 handle
        //             );

        //             const { collection } = await getClient();
        //             await collection.updateOne(
        //                 { agentId },
        //                 { $set: { profileId, adminProfileId, handle } }
        //             );

        //             res.status(!!profileId ? 200 : 400).json({
        //                 profileId,
        //                 txHash,
        //             });
        //         } catch (error) {
        //             console.log(error);
        //             res.status(400).send(error);
        //         }
        //     }
        // );
    }

    public registerAgent(runtime: AgentRuntime) {
        this.agents.set(runtime.agentId, runtime);
    }

    public unregisterAgent(runtime: AgentRuntime) {
        this.agents.delete(runtime.agentId);
    }

    public start(port: number) {
        this.server.listen(port, () => {
            console.log(
                `Bonsai client (and socket.io) server running on http://localhost:${port}/`
            );
        });
    }

    private initializeWebSocket() {
        this.io.on("connection", (socket) => {
            const roomId = socket.handshake.query.roomId as string;
            console.log(`ws joined: ${roomId}`);

            socket.join(roomId);
        });
    }
}

export const BonsaiClientInterface: Client = {
    start: async (runtime: AgentRuntime) => {
        console.log("BonsaiClientInterface start");
        const client = new BonsaiClient();

        // TODO: register actions

        client.registerAgent(runtime);
        client.start(parseInt(settings.SERVER_PORT || "3001"));
        return client;
    },
    stop: async (runtime: IAgentRuntime) => {
        console.warn("Orb client does not support stopping yet");
    },
};

export default BonsaiClientInterface;
