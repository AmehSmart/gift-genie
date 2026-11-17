import bcrypt from 'bcryptjs'
import db from  '../db.js'
import dotenv from "dotenv";
import {SYSTEM_PROMPT} from '../systemPrompt.js'
import OpenAI  from "openai";
import { generateGiftReply } from "../aiService.js";
dotenv.config();


// Initialize an OpenAI client for your provider using env vars
const openai = new OpenAI({
  apiKey: process.env.AI_KEY,
  baseURL: process.env.AI_URL,
});

export async function getAllConversation(req, res) {
  try {
    const conversations = await db.all(`
        SELECT id, title, created_at AS createdAt, updated_at AS updatedAt
        FROM conversations
        WHERE user_id = ?
        ORDER BY updated_at DESC, id DESC
      `, [req.session.userId]);

    return res.json({ conversations });
  } catch (error) {
    console.error("Could not load conversations:", error);
    return res.status(500).json({
      error: { message: "Could not load conversations." },
    });
  }

}


export async function createConservastion(req, res) {
  try {
    const result = await db.run(
      "INSERT INTO conversations (user_id) VALUES (?)",
      [req.session.userId]
    );

    const conversation = await db.get(`
        SELECT id, title, created_at AS createdAt, updated_at AS updatedAt
        FROM conversations
        WHERE id = ? AND user_id = ?
      `, [Number(result.lastInsertRowid), req.session.userId]);

    return res.status(201).json({ conversation });
  } catch (error) {
    console.error("Could not create conversation:", error);
    return res.status(500).json({
      error: { message: "Could not create a conversation." },
    });
  }
}


export async function getConversation(req, res) {
    const conversationId = Number(req.params.id);

  if (!Number.isSafeInteger(conversationId) || conversationId < 1) {
    return res.status(400).json({
      error: { message: "Invalid conversation ID." },
    });
  }

  try {
    const conversation = await db.get(`
        SELECT id, title, created_at AS createdAt, updated_at AS updatedAt
        FROM conversations
        WHERE id = ? AND user_id = ?
      `, [conversationId, req.session.userId]);

    if (!conversation) {
      return res.status(404).json({
        error: { message: "Conversation not found." },
      });
    }

    const messages = await db.all(`
        SELECT id, role, content, created_at AS createdAt
        FROM messages
        WHERE conversation_id = ?
        ORDER BY id ASC
      `, [conversationId]);

    return res.json({ conversation, messages });
  } catch (error) {
    console.error("Could not load conversation:", error);
    return res.status(500).json({
      error: { message: "Could not load conversation." },
    });
  }
}





export async function deleteConversation(req, res) {
     const conversationId = Number(req.params.id);

  if (!Number.isSafeInteger(conversationId) || conversationId < 1) {
    return res.status(400).json({
      error: { message: "Invalid conversation ID." },
    });
  }

  try {
    const result = await db.run(`
        DELETE FROM conversations
        WHERE id = ? AND user_id = ?
      `, [conversationId, req.session.userId]);

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        error: { message: "Conversation not found." },
      });
    }

    return res.status(204).end();
  } catch (error) {
    console.error("Could not delete conversation:", error);

    return res.status(500).json({
      error: { message: "Could not delete conversation." },
    });
  }
}


export async function  createConversationMessage(req, res) {
    const conversationId = Number(req.params.id);
  const { content } = req.body ?? {};
  const userId = req.session.userId;

  if (!Number.isSafeInteger(conversationId) || conversationId < 1) {
    return res.status(400).json({
      error: { message: "Invalid conversation ID." },
    });
  }

  if (typeof content !== "string" || !content.trim() || content.length > 4000) {
    return res.status(400).json({
      error: { message: "Message must be between 1 and 4000 characters." },
    });
  }

  const cleanContent = content.trim();

  try {
    const conversation = await db.get(
      "SELECT id, title FROM conversations WHERE id = ? AND user_id = ?",
      [conversationId, userId]
    );

    if (!conversation) {
      return res.status(404).json({
        error: { message: "Conversation not found." },
      });
    }

    const history = await db.all(`
        SELECT role, content
        FROM messages
        WHERE conversation_id = ?
        ORDER BY id ASC
      `, [conversationId]);

    let assistantContent;

    try {
      assistantContent = await generateGiftReply(openai, [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
        { role: "user", content: cleanContent },
      ]);
    } catch (error) {
      console.error("AI response failed:", error);
      return res.status(502).json({
        error: { message: "Gift Genie could not reply right now." },
      });
    }

    const statements = [
      {
        sql: "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)",
        args: [conversationId, "user", cleanContent],
      },
      {
        sql: "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)",
        args: [conversationId, "assistant", assistantContent],
      },
      history.length === 0
        ? {
            sql: `
              UPDATE conversations
              SET title = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND user_id = ?
            `,
            args: [
              cleanContent.replace(/\s+/g, " ").slice(0, 60),
              conversationId,
              userId,
            ],
          }
        : {
            sql: `
              UPDATE conversations
              SET updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND user_id = ?
            `,
            args: [conversationId, userId],
          },
    ];

    const [userResult, assistantResult] = await db.batch(statements);
    const userMessage = await db.get(
      "SELECT id, role, content, created_at AS createdAt FROM messages WHERE id = ?",
      [Number(userResult.lastInsertRowid)]
    );
    const assistantMessage = await db.get(
      "SELECT id, role, content, created_at AS createdAt FROM messages WHERE id = ?",
      [Number(assistantResult.lastInsertRowid)]
    );

    return res.status(201).json({ userMessage, assistantMessage });
  } catch (error) {
    console.error("Could not save conversation messages:", error);
    return res.status(500).json({
      error: { message: "Could not save the conversation." },
    });
  }
}

