import dotenv from "dotenv";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.AI_KEY,
  baseURL: process.env.AI_URL,
});

export const audioExtensions = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
};

function splitSpeechText(text) {
  const chunks = [];
  let remaining = text.trim();

  while (remaining.length > 200) {
    let splitAt = remaining.lastIndexOf(" ", 200);
    if (splitAt <= 0) splitAt = 200;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function toPlainSpeechText(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[*_~`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function transcriptionsController(req, res) {
  const contentType = (req.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const extension = audioExtensions[contentType];

  if (!extension) {
    return res.status(415).json({
      error: { message: "Unsupported audio format." },
    });
  }

  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({
      error: { message: "An audio recording is required." },
    });
  }

  try {
    const file = await toFile(req.body, `voice.${extension}`, {
      type: contentType,
    });
    const result = await openai.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      response_format: "json",
    });
    const text = result.text?.trim();

    if (!text) {
      return res.status(422).json({
        error: { message: "No speech was detected in that recording." },
      });
    }

    return res.json({ text });
  } catch (error) {
    console.error("Voice transcription failed:", error);
    return res.status(502).json({
      error: { message: "Could not transcribe the recording right now." },
    });
  }
}

export async function speechController(req, res) {
  const { text } = req.body ?? {};

  if (typeof text !== "string" || !text.trim() || text.length > 12000) {
    return res.status(400).json({
      error: { message: "Speech text must be between 1 and 12000 characters." },
    });
  }

  const speechText = toPlainSpeechText(text);
  if (!speechText || speechText.length > 4000) {
    return res.status(400).json({
      error: { message: "The reply is too long to convert to speech." },
    });
  }

  try {
    const audioChunks = [];
    for (const chunk of splitSpeechText(speechText)) {
      const response = await openai.audio.speech.create({
        model: "canopylabs/orpheus-v1-english",
        voice: "hannah",
        input: chunk,
        response_format: "wav",
      });
      audioChunks.push(
        Buffer.from(await response.arrayBuffer()).toString("base64")
      );
    }

    return res.json({ audioChunks });
  } catch (error) {
    console.error("Voice generation failed:", error);
    return res.status(502).json({
      error: { message: "Could not generate spoken audio right now." },
    });
  }
}
