import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const GEMINI_MODEL = "gemini-3.8-flash";

export function geminiProvider(
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
) {
  return createOpenAICompatible({
    name: "gemini",
    apiKey: env.GEMINI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    fetch: fetcher,
    supportsStructuredOutputs: true,
  });
}
