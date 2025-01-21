import { pinFile } from "../services/lens/ipfs";

export const parseAndUploadBase64Image = async (imageResponse) => {
    if (imageResponse.success && imageResponse.data?.[0]) {
        if (!imageResponse.data[0].includes("base64")) {
            console.error("Image response does not contain base64 data");
            return;
        }
        // Convert base64 to buffer
        const base64Data = imageResponse.data[0].replace(
            /^data:image\/\w+;base64,/,
            ""
        );
        const imageBuffer = Buffer.from(base64Data, "base64");

        // Create a file object that can be used with FormData
        const file = {
            buffer: imageBuffer,
            originalname: `generated_${Date.now()}.png`,
            mimetype: "image/png",
        };

        // Upload to your hosting service
        return await pinFile(file);
    } else {
        console.error("No image response");
    }
};
