import bodyParser from "body-parser";
import cors from "cors";
import express, { Request as ExpressRequest } from "express";
import multer, { File } from "multer";
import { generateCaption, generateImage } from "@ai16z/eliza/src/generation.ts";
import { composeContext } from "@ai16z/eliza/src/context.ts";
import { generateMessageResponse } from "@ai16z/eliza/src/generation.ts";
import { messageCompletionFooter } from "@ai16z/eliza/src/parsing.ts";
import { AgentRuntime } from "@ai16z/eliza/src/runtime.ts";
import {
    Content,
    Memory,
    ModelClass,
    State,
    Client,
    IAgentRuntime,
} from "@ai16z/eliza/src/types.ts";
import { stringToUuid } from "@ai16z/eliza/src/uuid.ts";
import settings from "@ai16z/eliza/src/settings.ts";
import createPost from "./createPost";
import { getWallets } from "./coinbase";
const upload = multer({ storage: multer.memoryStorage() });

export const messageHandlerTemplate =
    // {{goals}}
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

# Instructions: Write the next message for {{agentName}}. Ignore "action".
` + messageCompletionFooter;

export interface SimliClientConfig {
    apiKey: string;
    faceID: string;
    handleSilence: boolean;
    videoRef: any;
    audioRef: any;
}
export class OrbClient {
    private app: express.Application;
    private agents: Map<string, AgentRuntime>;

    constructor() {
        console.log("OrbClient constructor");
        this.app = express();
        this.app.use(cors());
        this.agents = new Map();

        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));

        this.app.post(
            "/:agentId/orb/create-post",
            async (req: express.Request, res: express.Response) => {
                console.log("OrbClient create-post");
                const agentId = req.params.agentId;
                const roomId = stringToUuid(
                    req.body.roomId ?? "default-room-" + agentId
                );
                const userId = stringToUuid(req.body.userId ?? "user");

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

                const wallets = await getWallets(agentId, true);
                if (!wallets?.polygon) {
                    res.status(404).send("Polygon wallet not found");
                    return;
                }

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

                const context = composeContext({
                    state,
                    template: messageHandlerTemplate,
                });

                // TODO: writes a new post, not responding to message
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

                let message = null as Content | null;

                await runtime.evaluate(memory, state);

                /* generate an image */
                let imageUrl;
                if (Math.random() < 0.15) {
                    // TODO: generate a prompt based on the post
                    const imagePrompt = `Generate an image to accompany this post: ${responseMessage.content.text}`;
                    const imageResponse = await generateImage(
                        { prompt: imagePrompt, width: 1024, height: 1024 },
                        runtime
                    );
                    // TODO: this url is base64 data. upload to ipfs first?
                    imageUrl = imageResponse.data[0];
                }

                /* create post */
                await createPost(
                    wallets.polygon,
                    wallets.profile.id,
                    responseMessage.content.text,
                    imageUrl
                );

                const result = await runtime.processActions(
                    memory,
                    [responseMessage],
                    state,
                    async (newMessages) => {
                        message = newMessages;
                        return [memory];
                    }
                );

                if (message) {
                    res.json([message, response]);
                } else {
                    res.json([response]);
                }
            }
        );
    }

    public registerAgent(runtime: AgentRuntime) {
        this.agents.set(runtime.agentId, runtime);
    }

    public unregisterAgent(runtime: AgentRuntime) {
        this.agents.delete(runtime.agentId);
    }

    public start(port: number) {
        this.app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}/`);
        });
    }
}

export const OrbClientInterface: Client = {
    start: async (runtime: IAgentRuntime) => {
        console.log("OrbClientInterface start");
        const client = new OrbClient();
        const serverPort = parseInt(settings.SERVER_PORT || "3000");
        client.start(serverPort);
        return client;
    },
    stop: async (runtime: IAgentRuntime) => {
        console.warn("Orb client does not support stopping yet");
    },
};

export default OrbClientInterface;
