import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";

export function getOpenAIModelName() {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

export function createOpenAICompatibilityProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "openai",
    apiKey,
    baseURL: "https://api.openai.com/v1",
    supportsStructuredOutputs: true,
  });
}

export async function checkOpenAICompatibilityConnection() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = getOpenAIModelName();

  if (!apiKey) {
    return {
      configured: false,
      connected: false,
      model,
      reason: "OPENAI_API_KEY is not configured",
    };
  }

  try {
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      return {
        configured: true,
        connected: false,
        model,
        reason:
          response.status === 404
            ? "The configured model is not available to this OpenAI project"
            : `OpenAI authentication check failed (${response.status})`,
      };
    }

    return { configured: true, connected: true, model, reason: null };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      model,
      reason: error instanceof Error ? error.message : "OpenAI connection check failed",
    };
  }
}
