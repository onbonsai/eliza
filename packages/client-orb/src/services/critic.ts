// Current image recognition service -- local recognition working, no openai recognition
import {
    AutoProcessor,
    AutoTokenizer,
    env,
    Florence2ForConditionalGeneration,
    Florence2Processor,
    PreTrainedModel,
    PreTrainedTokenizer,
    RawImage,
    type Tensor,
} from "@huggingface/transformers";
import fs from "fs";
import gifFrames from "gif-frames";
import os from "os";
import path from "path";
import {
    ModelProviderName,
    ModelClass,
    IAgentRuntime,
} from "@ai16z/eliza/src/types";
import { generateText, models } from "@ai16z/eliza";

interface Content {
    text: string;
    imageUrl: string;
}

class ContentJudgementService {
    private static instance: ContentJudgementService | null = null;
    private modelId: string = "onnx-community/Florence-2-base-ft";
    private device: string = "gpu";
    private model: PreTrainedModel | null = null;
    private processor: Florence2Processor | null = null;
    private tokenizer: PreTrainedTokenizer | null = null;
    private initialized: boolean = false;
    runtime: IAgentRuntime;

    private queue: Content[] = [];
    private processing: boolean = false;

    private constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
        this.initialize();
    }

    public static getInstance(runtime: IAgentRuntime): ContentJudgementService {
        if (!ContentJudgementService.instance) {
            ContentJudgementService.instance = new ContentJudgementService(
                runtime
            );
        }
        return ContentJudgementService.instance;
    }

    async initialize(
        modelId: string | null = null,
        device: string | null = null
    ): Promise<void> {
        if (this.initialized) {
            return;
        }

        const model = models[this.runtime.character.settings.model];

        if (model === ModelProviderName.LLAMALOCAL) {
            this.modelId = modelId || "onnx-community/Florence-2-base-ft";

            env.allowLocalModels = false;
            env.allowRemoteModels = true;
            env.backends.onnx.logLevel = "fatal";
            env.backends.onnx.wasm.proxy = false;
            env.backends.onnx.wasm.numThreads = 1;

            console.log("Downloading model...");

            this.model =
                await Florence2ForConditionalGeneration.from_pretrained(
                    this.modelId,
                    {
                        device: "gpu",
                        progress_callback: (progress) => {
                            if (progress.status === "downloading") {
                                console.log(
                                    `Model download progress: ${JSON.stringify(progress)}`
                                );
                            }
                        },
                    }
                );

            console.log("Model downloaded successfully.");

            this.processor = (await AutoProcessor.from_pretrained(
                this.modelId
            )) as Florence2Processor;
            this.tokenizer = await AutoTokenizer.from_pretrained(this.modelId);
        } else {
            this.modelId = "gpt-4o-mini";
            this.device = "cloud";
        }

        this.initialized = true;
    }

    async judgeContent(
        content: Content
    ): Promise<{ rating: number; comment: string }> {
        // if (this.device === "cloud") {
        //     return this.recognizeWithOpenAI(content.imageUrl);
        // } else {
        this.queue.push(content);
        this.processQueue();

        return new Promise((resolve, _) => {
            const checkQueue = () => {
                const index = this.queue.indexOf(content);
                if (index !== -1) {
                    setTimeout(checkQueue, 100);
                } else {
                    resolve(this.processContent(content));
                }
            };
            checkQueue();
        });
        // }
    }

    private async recognizeWithOpenAI(imageUrl: string): Promise<string> {
        const isGif = imageUrl.toLowerCase().endsWith(".gif");
        let imageData: Buffer | null = null;

        try {
            if (isGif) {
                console.log("Processing GIF: extracting first frame");
                const { filePath } =
                    await this.extractFirstFrameFromGif(imageUrl);
                imageData = fs.readFileSync(filePath);
            } else {
                const response = await fetch(imageUrl);
                if (!response.ok) {
                    throw new Error(
                        `Failed to fetch image: ${response.statusText}`
                    );
                }
                imageData = Buffer.from(await response.arrayBuffer());
            }

            if (!imageData || imageData.length === 0) {
                throw new Error("Failed to fetch image data");
            }

            const prompt =
                "Describe this image with a detailed description of the image including things that are depicted in the image, the structure, style of the image and anything else.";

            const text = await this.requestOpenAI(
                imageUrl,
                imageData,
                prompt,
                isGif
            );
            return text;
        } catch (error) {
            console.error("Error in recognizeWithOpenAI:", error);
            throw error;
        }
    }

    private async requestOpenAI(
        imageUrl: string,
        imageData: Buffer,
        prompt: string,
        isGif: boolean
    ): Promise<string> {
        for (let retryAttempts = 0; retryAttempts < 3; retryAttempts++) {
            try {
                let body;
                if (isGif) {
                    const base64Image = imageData.toString("base64");
                    body = JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    { type: "text", text: prompt },
                                    {
                                        type: "image_url",
                                        image_url: {
                                            url: `data:image/png;base64,${base64Image}`,
                                        },
                                    },
                                ],
                            },
                        ],
                        max_tokens: 500,
                    });
                } else {
                    body = JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    { type: "text", text: prompt },
                                    {
                                        type: "image_url",
                                        image_url: { url: imageUrl },
                                    },
                                ],
                            },
                        ],
                        max_tokens: 300,
                    });
                }

                const response = await fetch(
                    "https://api.openai.com/v1/chat/completions",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${this.runtime.getSetting("OPENAI_API_KEY")}`,
                        },
                        body: body,
                    }
                );

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                return data.choices[0].message.content;
            } catch (error) {
                console.log(
                    `Error during OpenAI request (attempt ${retryAttempts + 1}):`,
                    error
                );
                if (retryAttempts === 2) {
                    throw error;
                }
            }
        }
        throw new Error(
            "Failed to recognize image with OpenAI after 3 attempts"
        );
    }

    private async processQueue(): Promise<void> {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;

        while (this.queue.length > 0) {
            const content = this.queue.shift();
            await this.processContent(content);
        }

        this.processing = false;
    }

    private async processContent(
        content: Content
    ): Promise<{ rating: number; comment: string }> {
        const { text, imageUrl } = content;

        try {
            if (imageUrl) {
                console.log("***** PROCESSING IMAGE", imageUrl);
                const description = await this.recognizeWithOpenAI(imageUrl);
                return await this.rateAndComment(text, description);
            } else {
                return await this.rateAndComment(text, "N/A");
            }
        } catch (error) {
            console.error("Error in processContent:", error);
        }
    }

    private async rateAndComment(
        text: string,
        detailedCaption: string
    ): Promise<{ rating: number; comment: string | undefined }> {
        const prompt = `About ${this.runtime.character.name}:
        ${this.runtime.character.bio}
        ${this.runtime.character.lore}

        Some post examples:
        ${this.runtime.character.postExamples}

        Posting style:
        ${this.runtime.character.style.post}

        # Task: i have some text and a description of an accompanying image. i want you rate this on a scale of 1-10 on how good of
        content this is for social media, think about whether its entertaining, interesting or informative and if it is relevant
        for the bonsai community, which usually means its relevant to bonsais, creativity, culture, art, authenticity, memes or memecoins.
        perform this task as ${this.runtime.character.name}.

        post text: ${text}
        image caption: ${detailedCaption}

        format your reponse as a single number, then a period, then a reply to their post. reply with something interesting that adds to the conversation.
        if you gave it a high rating you can compliment it and if you gave it a low rating you can say why you don't like it but not in a mean way.
        Your reply should be a snappy one liner.
        DON'T JUSTIFY YOUR RATING, ONLY RESPOND WITH RATING, PERIOD, THEN A REPLY, NOTHING ELSE. NO HASHTAGS, NO EMOJIS`;

        for (let retryAttempts = 0; retryAttempts < 3; retryAttempts++) {
            try {
                // const body = JSON.stringify({
                //         model: "gpt-4o-mini",
                //         messages: [
                //             {
                //                 role: "user",
                //                 content: [
                //                     { type: "text", text: prompt },
                //                 ],
                //             },
                //         ],
                //         max_tokens: 300,
                //     });

                // const response = await fetch(
                //     "https://api.openai.com/v1/chat/completions",
                //     {
                //         method: "POST",
                //         headers: {
                //             "Content-Type": "application/json",
                //             Authorization: `Bearer ${this.runtime.getSetting("OPENAI_API_KEY")}`,
                //         },
                //         body: body,
                //     }
                // );

                // if (!response.ok) {
                //     throw new Error(`HTTP error! status: ${response.status}`);
                // }

                const reponseText = await generateText({
                    runtime: this.runtime,
                    context: prompt,
                    modelClass: ModelClass.SMALL,
                });

                const [ratingStr, ...commentParts] = reponseText.split(".");
                const rating = parseInt(ratingStr.trim());
                const comment = commentParts.join(".").trim();

                // Only return comment if it exists and isn't empty
                return {
                    rating,
                    comment:
                        comment.length > 0
                            ? comment.replace(/^["']|["']$/g, "")
                            : undefined,
                };
            } catch (error) {
                console.log(
                    `Error during OpenAI request (attempt ${retryAttempts + 1}):`,
                    error
                );
                if (retryAttempts === 2) {
                    throw error;
                }
            }
        }
    }

    private async extractFirstFrameFromGif(
        gifUrl: string
    ): Promise<{ filePath: string }> {
        const frameData = await gifFrames({
            url: gifUrl,
            frames: 1,
            outputType: "png",
        });
        const firstFrame = frameData[0];

        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, `gif_frame_${Date.now()}.png`);

        return new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(tempFilePath);
            firstFrame.getImage().pipe(writeStream);

            writeStream.on("finish", () => {
                resolve({ filePath: tempFilePath });
            });

            writeStream.on("error", reject);
        });
    }
}

export default ContentJudgementService;
