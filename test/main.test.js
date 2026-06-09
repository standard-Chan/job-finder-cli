const assert = require("node:assert/strict");
const test = require("node:test");

const {
  normalizeMaxPage,
  normalizeQuery,
} = require("../src/main");

test("normalizeQuery uses default query when input is empty", () => {
  assert.equal(normalizeQuery(""), "백엔드 신입 Spring Node.js");
  assert.equal(normalizeQuery("  AWS  "), "AWS");
});

test("normalizeMaxPage falls back to default and caps large values", () => {
  assert.equal(normalizeMaxPage(""), 3);
  assert.equal(normalizeMaxPage("abc"), 3);
  assert.equal(normalizeMaxPage("0"), 3);
  assert.equal(normalizeMaxPage("11"), 10);
  assert.equal(normalizeMaxPage("2"), 2);
});
