import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const GROQ_MODEL = "openai/gpt-oss-120b";

export function groqProvider(
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
) {
  return createOpenAICompatible({
    name: "groq",
    apiKey: env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
    fetch: fetcher,
    supportsStructuredOutputs: true,
  });
}
