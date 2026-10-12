import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/chat/route";
test("chat blocks cross-origin requests before invoking AI", async () => {
  const response = await POST(
    new Request("https://daylight.test/api/chat", {
      method: "POST",
      headers: {
        origin: "https://elsewhere.test",
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("chat requires a verified sign-in before invoking AI", async () => {
  const response = await POST(
    new Request("https://daylight.test/api/chat", {
      method: "POST",
      headers: {
        origin: "https://daylight.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question: "Help", context: "{}" }),
    }),
  );
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /Sign in/);
});
