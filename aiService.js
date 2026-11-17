export async function generateGiftReply(openai, input) {
  const fallbackModels = (process.env.AI_FALLBACK_MODELS || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  const models = [
    ...new Set([process.env.AI_MODEL, ...fallbackModels].filter(Boolean)),
  ];

  if (models.length === 0) {
    throw new Error("No AI models are configured.");
  }

  let lastError;

  for (const model of models) {
    try {
      const response = await openai.responses.create({
        model,
        input,
        tools: [{ type: "browser_search" }],
      });

      const answer = response.output_text?.trim();

      if (!answer) {
        throw new Error("The AI returned an empty response.");
      }

      console.log(`Reply generated using: ${model}`);
      return answer;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Model "${model}" failed: ${message}. Trying next...`);
    }
  }

  throw lastError || new Error("All configured AI models failed.");
}