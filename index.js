import OpenAI from "openai";
import { marked } from "marked";
import DOMPurify from "dompurify"; // for sanitizing the input 
import {
  checkEnvironment,
  autoResizeTextarea,
  setLoading,
  showStream,
} from "./utils.js";
checkEnvironment();

// Initialize an OpenAI client for your provider using env vars
const openai = new OpenAI({
  apiKey: process.env.AI_KEY,
  baseURL: process.env.AI_URL,
  dangerouslyAllowBrowser: true,
});

// Get UI elements
const giftForm = document.getElementById("gift-form");
const userInput = document.getElementById("user-input");
const outputContent = document.getElementById("output-content");

function start() {
  // Setup UI event listeners
  userInput.addEventListener("input", () => autoResizeTextarea(userInput));
  giftForm.addEventListener("submit", handleGiftRequest);
}

// Initialize messages array with system prompt
const messages = [
  {
    role: "system",
    content: `You are Gift Genie.

The user will describe a person, their interests, age, hobbies,
or occasion.

Suggest 5-10 appropriate gifts.

If the user's message does not contain enough information
to recommend gifts, ask for more details instead.

Keep responses under 100 words.`,
  },
];

async function handleGiftRequest(e) {
  // Prevent default form submission
  e.preventDefault();

     // Get user input, trim whitespace, exit if empty
  const userPrompt = userInput.value.trim();
  
  if (!userPrompt) {
    return
  };

  // Set loading state
  setLoading(true);

   messages.push({
    role : 'user',
   content: userPrompt
   }) 
  
 try{


   

const response = await openai.chat.completions.create(
  { 
     model: process.env.AI_MODEL,
      messages ,
      stream : true
    //  max_completion_tokens : 256
    }
)
  // Show output container immediately for streaming feedback
    showStream();
    let fullResponse = ''
for await (const chunk of response){
  const content = chunk.choices[0]?.delta?.content || ""
  fullResponse += content
  // const markdown =  response.choices[0]?.message?.content
const purifyResponse = DOMPurify.sanitize(fullResponse, { KEEP_CONTENT: false })
outputContent.innerHTML = marked.parse(purifyResponse)|| "No response generated."

// auto scroll
outputContent.scrollTop = outputContent.scrollHeight
}

  // Clear loading state
 }catch(error){
  console.error(error);
  outputContent.textContent =
    "Sorry, I can't access what I need right now. Please try again."

 } finally{
  // Always clear loading state 
    setLoading(false);
 }
  
}

start();
