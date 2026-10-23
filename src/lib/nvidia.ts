import { APICallError } from "ai";

// NVIDIA retires hosted models without notice; a retired model answers 404.
// Models verified to answer on integrate.api.nvidia.com, fastest first.
export const NVIDIA_MODELS = [
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-3-ultra-550b-a55b",
];
// Spreadsheet mapping must return cell references; the smaller model tends
// to return cell values instead, so imports prefer the larger model.
export const NVIDIA_IMPORT_MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
];

export function nvidiaModelCandidates(
  configured?: string,
  models = NVIDIA_MODELS,
) {
  return [
    ...new Set(
      [configured?.trim(), ...models].filter((model): model is string =>
        Boolean(model),
      ),
    ),
  ];
}

function missingModel(error: unknown) {
  return APICallError.isInstance(error) && error.statusCode === 404;
}

// Try the configured model first, falling back only when a model is missing.
// Any other failure (auth, timeout, bad output) is reported unchanged.
export async function withNvidiaModel<T>(
  configured: string | undefined,
  run: (model: string) => Promise<T>,
  models = NVIDIA_MODELS,
): Promise<T> {
  let lastError: unknown;
  for (const model of nvidiaModelCandidates(configured, models)) {
    try {
      return await run(model);
    } catch (error) {
      if (!missingModel(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
