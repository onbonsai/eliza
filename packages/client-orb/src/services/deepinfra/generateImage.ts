import { TextToImage } from "deepinfra"

const MODEL = "black-forest-labs/FLUX-1.1-pro"

export const generateImageDeepInfra = async (prompt: string) => {
  const DEEPINFRA_API_KEY = process.env.DEEPINFRA_API_KEY
  if (!DEEPINFRA_API_KEY) {
    throw new Error("DEEPINFRA_API_KEY is not defined in environment variables")
  }

  const model = new TextToImage(MODEL, DEEPINFRA_API_KEY)
  const response = await model.generate({
    prompt,
  })

  // @ts-ignore
  return response.image_url
}
