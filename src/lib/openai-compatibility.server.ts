import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Must be a model id the configured OpenAI project can actually serve.
 * Override per-environment with OPENAI_MODEL.
 *
 * A wrong id here is expensive to notice: every compatibility review 404s and
 * silently degrades to the fixed rubric, which looks exactly like "OpenAI was
 * briefly unavailable". `checkOpenAICompatibilityConnection` below exists to
 * make that failure loud instead.
 */
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

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

export type OpenAICompatibilityStatus = {
  configured: boolean;
  connected: boolean;
  model: string;
  /** Set to "model_not_found" when the configured model id is not servable. */
  code: "ok" | "not_configured" | "model_not_found" | "auth_failed" | "unreachable";
  reason: string | null;
  /** What the operator should actually do about it. */
  remedy: string | null;
};

export async function checkOpenAICompatibilityConnection(): Promise<OpenAICompatibilityStatus> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = getOpenAIModelName();
  const source = process.env.OPENAI_MODEL?.trim() ? "OPENAI_MODEL" : "DEFAULT_OPENAI_MODEL";

  if (!apiKey) {
    return {
      configured: false,
      connected: false,
      model,
      code: "not_configured",
      reason: "OPENAI_API_KEY is not configured",
      remedy:
        "Set OPENAI_API_KEY to enable the 20% AI review. Until then every score is fixed-rubric only, which is a supported mode — not an outage.",
    };
  }

  try {
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    });

    if (response.status === 404) {
      const reason = `The model id "${model}" (from ${source}) does not exist or is not available to this OpenAI project.`;
      const remedy = `Set OPENAI_MODEL to a model this project can serve, or update DEFAULT_OPENAI_MODEL in src/lib/openai-compatibility.server.ts. Every compatibility review will fall back to the fixed rubric until this is fixed.`;
      // Loud on purpose: a bad model id degrades silently and permanently,
      // and reads as intermittent AI unavailability in the admin UI.
      console.error(`[openai-compatibility] MISCONFIGURED MODEL — ${reason} ${remedy}`);
      return { configured: true, connected: false, model, code: "model_not_found", reason, remedy };
    }

    if (!response.ok) {
      const reason = `OpenAI rejected the credentials check with HTTP ${response.status}.`;
      console.error(`[openai-compatibility] ${reason}`);
      return {
        configured: true,
        connected: false,
        model,
        code: "auth_failed",
        reason,
        remedy:
          response.status === 401 || response.status === 403
            ? "Check that OPENAI_API_KEY is valid and has access to this project."
            : "Check the OpenAI status page and retry.",
      };
    }

    return { configured: true, connected: true, model, code: "ok", reason: null, remedy: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "OpenAI connection check failed";
    console.error(`[openai-compatibility] Could not reach OpenAI: ${reason}`);
    return {
      configured: true,
      connected: false,
      model,
      code: "unreachable",
      reason,
      remedy: "Could not reach api.openai.com. Check network egress from the deployment.",
    };
  }
}
