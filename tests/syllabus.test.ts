import { strict as assert } from "node:assert";
import { test } from "node:test";
import { searchSyllabus } from "../src/lib/syllabus";

test("syllabus searches day numbers exactly and supports topics and homework", () => {
  assert.equal(
    searchSyllabus("Day 65")[0].title,
    "Kerberoasting & Ticket Extraction",
  );
  assert.deepEqual(
    searchSyllabus("1").map((lesson) => lesson.day),
    [1],
  );
  assert.ok(searchSyllabus(" SQL ").some((lesson) => lesson.day === 43));
  assert.ok(
    searchSyllabus("linux permissions").some((lesson) => lesson.day === 10),
  );
  assert.ok(
    searchSyllabus("Windows PrivEsc Arena").some((lesson) => lesson.day === 94),
  );
  assert.deepEqual(searchSyllabus("day 101"), []);
  assert.deepEqual(searchSyllabus(""), []);
  assert.deepEqual(searchSyllabus("my custom activity"), []);
});
