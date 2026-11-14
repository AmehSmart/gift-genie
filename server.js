import express from "express";
import cors from 'cors'
import OpenAI  from "openai";
import {checkEnvironment} from './utils.js'
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors())

// Initialize an OpenAI client for your provider using env vars
const openai = new OpenAI({
  apiKey: process.env.AI_KEY,
  baseURL: process.env.AI_URL,
});

// Initialize messages array with system prompt
const messages = [
  {
    role: "system",
    content: `You are the Gift Genie. 

You generate gift ideas that feel thoughtful, specific, and genuinely useful.
Your output must be in structured Markdown.
Do not write introductions or conclusions.
Start directly with the gift suggestions.

Each gift must:
- Have a clear heading
- Include a short explanation of why it works

If the user mentions a location, situation, or constraint,
adapt the gift ideas and add another short section 
under each gift that guides the user to get the gift in that 
constrained context.

After the gift ideas, include a section titled "Questions for you"
with clarifying questions that would help improve the recommendations.`,
  },
];

 app.post("/api/gift", async(req, res) => {
 try{
   // TODO: Step 2 — extract userPrompt from req.body and add to messages
  const { userPrompt } = req.body
  messages.push({
    role : 'user',
    content : userPrompt
  })
  // TODO: Step 3 — send chat completions request
   // Use Responses API with web_search_preview tool
    const response = await openai.responses.create({
      model: process.env.AI_MODEL,
      input: messages,
      tools: [{ type: "web_search_preview" }],// will make it search web for you base on the current time and location 
    });
  // TODO: Step 4 — extract content and send back as JSON
    const data = response.output_text
  res.json({ message: data });
 } catch(error){
  console.error(error);

    res.status(500).json({
       message: `It's not you, it's us. 
    Something went wrong on the server` 
    });
 }
})

const PORT = 3001;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
