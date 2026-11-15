import express from "express";
import { rateLimit } from "express-rate-limit";
import { guestMessageController } from "../controllers/guestController.js";

export const guestRouter = express.Router();

const guestMessageRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({
      error: {
        message: "Guest message limit reached. Try again in 15 minutes or sign in.",
      },
    }),
});

guestRouter.post("/messages", guestMessageRateLimit, guestMessageController);
