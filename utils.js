/**
 * Check that environment variables are configured
 */
export function checkEnvironment() {
  if (!process.env.AI_URL) {
    throw new Error(
      "Missing AI_URL. This tells us which AI provider you're using."
    );
  }
  if (!process.env.AI_MODEL) {
    throw new Error("Missing AI_MODEL. The AI request needs a model name.");
  }
  if (!process.env.AI_KEY) {
    throw new Error("Missing AI_KEY. Your API key is not being picked up.");
  }
  console.log("AI provider URL:", process.env.AI_URL);
  console.log("AI model:", process.env.AI_MODEL);
}

/**
 * Auto-resize textarea to fit content
 */
export function autoResizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

/**
 * Toggle the message composer while a request is in flight.
 */
export function setLoading(isLoading) {
  const lampButton = document.getElementById("lamp-button");
  const lampText = document.querySelector(".lamp-text");
  const userInput = document.getElementById("user-input");

  lampButton.disabled = isLoading;
  userInput.disabled = isLoading;
  lampButton.classList.toggle("loading", isLoading);
  lampText.textContent = isLoading ? "Finding gift ideas..." : "Find gift ideas";
}

