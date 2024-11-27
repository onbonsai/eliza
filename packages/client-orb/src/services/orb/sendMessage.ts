import axios from "axios";

const ORB_API_URL =
    "https://us-central1-stellar-verve-314311.cloudfunctions.net/send-bonsai-message-in-jam";

// send a message in a jam (hardcoded for bonsai club for now)
export const sendMessage = async (
    content: string,
    messageId?: string
): Promise<boolean> => {
    console.log(`sending message to bonsai jam`);
    const { status } = await axios.post(
        ORB_API_URL,
        { content, messageId },
        {
            headers: {
                "orb-access-token": `Bearer ${process.env.ORB_JAM_API_BEARER_KEY!}`,
            },
        }
    );
    return status === 200;
};
