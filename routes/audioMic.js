import express from "express";
import { rateLimit } from "express-rate-limit";
import {
  audioExtensions,
  transcriptionsController,
  speechController,
} from "../controllers/audioMicController.js";

export const audioRouter = express.Router();

const voiceRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({
      error: { message: "Voice request limit reached. Try again in 15 minutes." },
    }),
});

audioRouter.post(
  "/transcriptions",
  voiceRateLimit,
  express.raw({ type: Object.keys(audioExtensions), limit: "10mb" }),
  transcriptionsController
);
audioRouter.post("/speech", voiceRateLimit, speechController);


