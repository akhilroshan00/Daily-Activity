import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/daily-report/route";

const owner = "11111111-1111-4111-8111-111111111111";
function request(body: unknown, extra: Record<string, string> = {}) {
  return new Request("https://daylight.test/api/daily-report", {
    method: "POST",
    headers: {
      origin: "https://daylight.test",
      "Content-Type": "application/json",
      ...extra,
    },
    body: JSON.stringify(body),
  });
}
test("daily reports reject cross-origin and unauthenticated requests before AI", async () => {
  assert.equal(
    (await POST(request({}, { origin: "https://elsewhere.test" }))).status,
    403,
  );
  const response = await POST(request({}));
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /Sign in/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("daily report endpoint validates entries and uses the existing AI provider without sending mail", async (t) => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: "https://auth.test",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-public-key",
    GROQ_API_KEY: "test-key",
  };
  const previous = Object.fromEntries(
    Object.keys(env).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  let aiCalls = 0;
  let aiBody = "";
  let aiMode: "success" | "failure" | "truncated" = "success";
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url === "https://auth.test/auth/v1/user")
        return Response.json({
          id: owner,
          aud: "authenticated",
          role: "authenticated",
          email: "test@example.test",
          user_metadata: {},
        });
      assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
      aiCalls++;
      aiBody = String(init?.body);
      if (aiMode === "failure")
        return Response.json(
          {
            error: { message: "private upstream detail", type: "server_error" },
          },
          { status: 500 },
        );
      return Response.json({
        id: "report-test",
        object: "chat.completion",
        created: 1,
        model: "test-model",
        choices: [
          {
            index: 0,
            finish_reason: aiMode === "truncated" ? "length" : "stop",
            message: {
              role: "assistant",
              content:
                "Daily Progress Report\nDate: 24 October 2026\n\n1. Updated presentation\n- Updated the recorded slides.\n\n2. Key Learnings\n- Not recorded.\n\nSummary\nI updated the presentation.",
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      });
    },
  );
  const auth = { Authorization: "Bearer test-access-token" };
  const invalid = await POST(
    request({ date: "2026-02-30", entry: {}, template: "Template" }, auth),
  );
  assert.equal(invalid.status, 400);
  assert.equal(aiCalls, 0);
  const response = await POST(
    request(
      {
        date: "2026-10-24",
        entry: {
          logged: false,
          studyMinutes: 0,
          remark: "Updated the recorded slides.",
        },
        template:
          "Daily Progress Report\nDate: 17 October 2026\n1. Sample activity\n- Sample detail\n2. Key Learnings\nSummary",
      },
      auth,
    ),
  );
  assert.equal(
    response.status,
    200,
    JSON.stringify(await response.clone().json()),
  );
  const result = await response.json();
  assert.equal(result.owner, owner);
  assert.equal(result.date, "2026-10-24");
  assert.match(result.text, /24 October 2026/);
  assert.equal(result.sentAt, undefined);
  assert.equal(aiCalls, 1);
  assert.match(
    aiBody,
    /sample dates, topics, achievements and claims are NOT facts/,
  );
  assert.match(aiBody, /Updated the recorded slides/);

  const large = await POST(
    request(
      { date: "2026-10-24", entry: {}, template: "x".repeat(180000) },
      auth,
    ),
  );
  assert.equal(large.status, 413);
  assert.equal(aiCalls, 1);
  const payload = {
    date: "2026-10-24",
    entry: { logged: false, studyMinutes: 0, remark: "Updated slides." },
    template: "Daily Progress Report",
  };
  aiMode = "truncated";
  const truncated = await POST(request(payload, auth));
  assert.equal(truncated.status, 502);
  assert.equal((await truncated.json()).text, undefined);
  aiMode = "failure";
  const failed = await POST(request(payload, auth));
  assert.equal(failed.status, 502);
  const failureBody = await failed.text();
  assert.doesNotMatch(failureBody, /private upstream detail|test-key/);
  // A failure releases the per-user request guard so a manual retry works.
  aiMode = "success";
  assert.equal((await POST(request(payload, auth))).status, 200);
});
