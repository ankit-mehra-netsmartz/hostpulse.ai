import { ElevenLabsClient } from "elevenlabs";
import WebSocket from "ws";
import { logger } from "./logger";

// ElevenLabs integration using Replit Connectors
let connectionSettings: any;

async function getCredentials(): Promise<string> {
  // First try environment variable (user's secret takes priority)
  const envApiKey = process.env.ELEVENLABS_API_KEY;
  if (envApiKey) {
    logger.info("ElevenLabs", "Using environment variable API key");
    return envApiKey;
  }

  // Fall back to Replit Connectors
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (hostname && xReplitToken) {
    try {
      connectionSettings = await fetch(
        "https://" +
          hostname +
          "/api/v2/connection?include_secrets=true&connector_names=elevenlabs",
        {
          headers: {
            Accept: "application/json",
            X_REPLIT_TOKEN: xReplitToken,
          },
        },
      )
        .then((res) => res.json())
        .then((data) => data.items?.[0]);

      if (connectionSettings?.settings?.api_key) {
        logger.info("ElevenLabs", "Using Replit Connectors API key");
        return connectionSettings.settings.api_key;
      }
    } catch (error) {
      logger.info("ElevenLabs", "Replit Connectors not available");
    }
  }

  throw new Error(
    "ELEVENLABS_API_KEY not configured. Please set it in your secrets or connect ElevenLabs.",
  );
}

export async function getUncachableElevenLabsClient() {
  const apiKey = await getCredentials();
  return new ElevenLabsClient({ apiKey });
}

export async function getElevenLabsApiKey() {
  return await getCredentials();
}

export async function createElevenLabsStreamingTTS(
  voiceId: string,
  onAudioChunk: (audioBase64: string) => void,
  options: { modelId?: string; outputFormat?: string } = {},
) {
  const { modelId = "eleven_flash_v2_5", outputFormat = "pcm_16000" } = options;
  const apiKey = await getCredentials();
  const uri =
    "wss://api.elevenlabs.io/v1/text-to-speech/" +
    voiceId +
    "/stream-input?model_id=" +
    modelId +
    "&output_format=" +
    outputFormat;

  const websocket = new WebSocket(uri, {
    headers: { "xi-api-key": apiKey },
  });

  return new Promise<{
    send: (text: string) => void;
    flush: () => void;
    close: () => void;
  }>((resolve, reject) => {
    websocket.on("error", reject);

    websocket.on("open", () => {
      websocket.send(
        JSON.stringify({
          text: " ",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            use_speaker_boost: false,
          },
          generation_config: { chunk_length_schedule: [120, 160, 250, 290] },
        }),
      );

      resolve({
        send: (text: string) => {
          websocket.send(JSON.stringify({ text }));
        },
        flush: () => {
          websocket.send(JSON.stringify({ text: " ", flush: true }));
        },
        close: () => {
          websocket.send(JSON.stringify({ text: "" }));
        },
      });
    });

    websocket.on("message", (event) => {
      const data = JSON.parse(event.toString());
      if (data.audio) {
        onAudioChunk(data.audio);
      }
    });
  });
}

export async function generateSongWithTTS(
  lyrics: string,
  voiceId: string = "Xb7hH8MSUJpSbSDYk0k2",
  musicStyle: string = "pop",
): Promise<Buffer> {
  const apiKey = await getCredentials();

  // Build a music prompt that includes the lyrics and style
  const musicPrompt = `Create a ${musicStyle} song with the following lyrics sung clearly:

${lyrics}

Style: ${musicStyle}, upbeat, clear vocals, professional production`;

  logger.info(
    "Song",
    `Using Music API with prompt length: ${musicPrompt.length}`,
  );

  try {
    // Use the Music API directly via HTTP
    const response = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: musicPrompt,
        duration_ms: 60000, // 60 seconds
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        "Song",
        `Music API error response: ${response.status} ${errorText}`,
      );
      throw new Error(`Music API error: ${response.status} - ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    logger.info("Song", `Music API returned ${arrayBuffer.byteLength} bytes`);
    return Buffer.from(arrayBuffer);
  } catch (error: any) {
    logger.error("Song", "Music API error:", error);
    throw error;
  }
}
