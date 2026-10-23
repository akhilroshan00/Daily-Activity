import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const XAI_MODEL = "grok-4.20-0309-non-reasoning";

export function grokProvider(
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
) {
  return createOpenAICompatible({
    name: "grok",
    apiKey: env.XAI_API_KEY,
    baseURL: "https://api.x.ai/v1",
    fetch: fetcher,
    supportsStructuredOutputs: true,
  });
}
