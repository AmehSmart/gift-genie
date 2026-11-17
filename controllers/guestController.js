import dotenv from "dotenv";
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "../systemPrompt.js";
import { generateGiftReply } from "../aiService.js";


dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.AI_KEY,
  baseURL: process.env.AI_URL,
});

export async function guestMessageController(req, res) {
  const { content, history = [] } = req.body ?? {};

  if (typeof content !== "string" || !content.trim() || content.length > 4000) {
    return res.status(400).json({
      error: { message: "Message must be between 1 and 4000 characters." },
    });
  }

  if (
    !Array.isArray(history) ||
    history.length > 20 ||
    !history.every(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0 &&
        message.content.length <= 4000
    ) ||
    history.reduce((total, message) => total + message.content.length, 0) > 16000
  ) {
    return res.status(400).json({
      error: { message: "Guest chat history is invalid or too long." },
    });
  }

  const cleanContent = content.trim();
  const safeHistory = history.map(({ role, content }) => ({ role, content }));

  try {
    const assistantContent = await generateGiftReply(openai, [
      { role: "system", content: SYSTEM_PROMPT },
      ...safeHistory,
      { role: "user", content: cleanContent },
    ]);

    return res.json({
      userMessage: { role: "user", content: cleanContent },
      assistantMessage: { role: "assistant", content: assistantContent },
    });
  } catch (error) {
    console.error("Guest AI response failed:", error);
    return res.status(502).json({
      error: { message: "Gift Genie could not reply right now." },
    });
  }
}
