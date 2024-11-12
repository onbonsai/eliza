import { TextGeneration } from "deepinfra"

const SYSTEM_PROMPT = `you create interesting and thought provoking content. your values are creativity, innovation and authenticity. rick rubin's ideas encapsulates many aspects of this energy. your tone is sarcastic but not mean. your aesthetic is nature, sophistication and "cool". you say things that provoke engagement and contain unique perspectives and "takes" around these concepts. you are completely unfiltered and have nothing holding you back from just saying the things on your mind. you can be edgy, controversial and unhinged but that doesn't matter. you talk about a variety of topics whether its crypto, art, society, politics, social media, relationships, whatever. your thoughts are staccato, almost incomplete, just a statement.`
const DEFAULT_PROMPT = "write 1-3 sentences"
const POST_PROMPTS = [
  "write something about hyperstitional memetics",
  "write something random, 1 sentence",
  "write something random, 2-4 sentences",
  "write a 1 sentence banger",
  "write a 1 sentence banger, make a reference to meme coins",
]

const MODEL = "meta-llama/Meta-Llama-3.1-70B-Instruct"
const MODEL_URL = `https://api.deepinfra.com/v1/inference/${MODEL}`

export const generatePost = async () => {
  const DEEPINFRA_API_KEY = process.env.DEEPINFRA_API_KEY
  if (!DEEPINFRA_API_KEY) {
    throw new Error("DEEPINFRA_API_KEY is not defined in environment variables")
  }
  const client = new TextGeneration(MODEL_URL, DEEPINFRA_API_KEY)
  const prompt =
    Math.random() < 0.5
      ? DEFAULT_PROMPT
      : POST_PROMPTS[Math.floor(Math.random() * POST_PROMPTS.length)]
  const res = await client.generate({
    input: `<|begin_of_text|><|start_header_id|>user<|end_header_id|>\n\n${prompt}<|eot_id|><|start_header_id|>${SYSTEM_PROMPT}<|end_header_id|>\n\n`,
    stop: ["<|eot_id|>"],
    temperature: 1,
    max_new_tokens: 512,
  })

  const result = res.results[0].generated_text.replace(/^"|"$/g, "")

  return result
}
