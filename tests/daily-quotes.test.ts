import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  fallbackQuote,
  loadDailyQuote,
  quoteDayIndex,
  validDailyQuote,
} from "../src/lib/daily-quotes";

test("daily quotes use stable date selection across leap days and reject normalized invalid dates", () => {
  assert.equal(quoteDayIndex("2024-03-01") - quoteDayIndex("2024-02-29"), 1);
  assert.deepEqual(fallbackQuote("2026-10-08"), fallbackQuote("2026-10-08"));
  assert.notEqual(
    fallbackQuote("2026-10-08").text,
    fallbackQuote("2026-10-09").text,
  );
  for (const date of ["2026-02-29", "2026-13-01", "today", "2026-1-01"])
    assert.throws(() => quoteDayIndex(date));
});
test("public quote API receives no user data and malformed or unavailable content falls back", async () => {
  const urls: string[] = [];
  const fetcher: typeof fetch = async (url) => {
    urls.push(String(url));
    return Response.json({ quote: "A useful thought.", author: "Test author" });
  };
  const first = await loadDailyQuote("2026-10-08", fetcher);
  assert.equal(first.source, "DummyJSON");
  await loadDailyQuote("2026-10-08", fetcher);
  assert.equal(urls[0], urls[1]);
  assert.match(urls[0], /^https:\/\/dummyjson.com\/quotes\/\d+$/);
  const invalid: typeof fetch = async () =>
    Response.json({ quote: {}, author: null });
  assert.deepEqual(
    await loadDailyQuote("2026-10-08", invalid),
    fallbackQuote("2026-10-08"),
  );
  const offline: typeof fetch = async () => {
    throw new Error("Offline");
  };
  assert.deepEqual(
    await loadDailyQuote("2026-10-08", offline),
    fallbackQuote("2026-10-08"),
  );
  assert.equal(validDailyQuote(first, "2026-10-09"), false);
});
