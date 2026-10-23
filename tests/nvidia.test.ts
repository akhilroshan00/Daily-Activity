import { strict as assert } from "node:assert";
import { test } from "node:test";
import { APICallError } from "ai";
import {
  NVIDIA_MODELS,
  nvidiaModelCandidates,
  withNvidiaModel,
} from "../src/lib/nvidia";

function apiError(statusCode: number) {
  return new APICallError({
    message: `status ${statusCode}`,
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    requestBodyValues: {},
    statusCode,
  });
}

test("the configured model is tried first without duplicates", () => {
  assert.deepEqual(nvidiaModelCandidates(" retired/model "), [
    "retired/model",
    ...NVIDIA_MODELS,
  ]);
  assert.deepEqual(nvidiaModelCandidates(NVIDIA_MODELS[1]), [
    NVIDIA_MODELS[1],
    NVIDIA_MODELS[0],
  ]);
  assert.deepEqual(nvidiaModelCandidates(undefined), NVIDIA_MODELS);
});

test("a retired configured model falls back to a working model", async () => {
  const tried: string[] = [];
  const answer = await withNvidiaModel("retired/model", async (model) => {
    tried.push(model);
    if (model === "retired/model") throw apiError(404);
    return `answered by ${model}`;
  });
  assert.deepEqual(tried, ["retired/model", NVIDIA_MODELS[0]]);
  assert.equal(answer, `answered by ${NVIDIA_MODELS[0]}`);
});

test("other NVIDIA failures are not retried with another model", async () => {
  let calls = 0;
  await assert.rejects(
    withNvidiaModel("any/model", async () => {
      calls++;
      throw apiError(401);
    }),
    /status 401/,
  );
  assert.equal(calls, 1);
});
