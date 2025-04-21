export const generateSpeech = async (text: string, voiceId: string): Promise<Buffer | undefined> => {
  // Convert to speech using ElevenLabs
  const elevenLabsApiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const apiKey = process.env.ELEVENLABS_XI_API_KEY;

  if (!apiKey) {
    console.log("ELEVENLABS_XI_API_KEY not configured");
    return;
  }

  const speechResponse = await fetch(elevenLabsApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text,
      model_id:
        process.env.ELEVENLABS_MODEL_ID ||
        "eleven_multilingual_v2",
      voice_settings: {
        stability: Number.parseFloat(
          process.env.ELEVENLABS_VOICE_STABILITY || "0.5"
        ),
        similarity_boost: Number.parseFloat(
          process.env.ELEVENLABS_VOICE_SIMILARITY_BOOST ||
          "0.9"
        ),
        style: Number.parseFloat(
          process.env.ELEVENLABS_VOICE_STYLE || "0.66"
        ),
        use_speaker_boost:
          process.env
            .ELEVENLABS_VOICE_USE_SPEAKER_BOOST ===
          "true",
      },
    }),
  });

  if (!speechResponse.ok) {
    console.log(`ElevenLabs API error: ${speechResponse.statusText}`);
    return;
  }

  const audioBuffer = await speechResponse.arrayBuffer();
  return Buffer.from(audioBuffer);
}