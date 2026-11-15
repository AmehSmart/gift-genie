import express from "express";
import cors from 'cors'
import dotenv from "dotenv";
import session from 'express-session'
import path from "node:path";
import { fileURLToPath } from "node:url";
import { conversationRouter} from './routes/conversation.js'
import {authRouter} from './routes/auth.js'
import { audioRouter } from './routes/audioMic.js'
import { guestRouter } from './routes/guest.js'
import {requireAuth} from './middleware/requireAuth.js'
dotenv.config();

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(cors())

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);


app.use('/api/auth',authRouter)
app.use('/api/voice', audioRouter)
app.use('/api/guest', guestRouter)
app.use('/api', requireAuth, conversationRouter)

app.use(express.static(path.join(appDirectory, "dist")));

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
