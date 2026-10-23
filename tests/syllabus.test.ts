import { strict as assert } from "node:assert";
import { test } from "node:test";
import { searchSyllabus } from "../src/lib/syllabus";

test("syllabus matches subjects and homework but excludes day-number shortcuts", () => {
  assert.deepEqual(searchSyllabus("Day 65"), []);
  assert.deepEqual(searchSyllabus("1"), []);
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
