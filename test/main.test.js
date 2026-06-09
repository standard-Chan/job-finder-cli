const assert = require("node:assert/strict");
const test = require("node:test");

const {
  normalizeMaxPage,
  normalizeQuery,
  normalizeSearchMode,
} = require("../src/main");

const { SEARCH_MODES } = require("../src/matcher/keywordScorer");

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

test("normalizeSearchMode defaults to semantic and accepts keyword mode", () => {
  assert.equal(normalizeSearchMode(""), SEARCH_MODES.SEMANTIC);
  assert.equal(normalizeSearchMode("1"), SEARCH_MODES.SEMANTIC);
  assert.equal(normalizeSearchMode("2"), SEARCH_MODES.KEYWORD);
  assert.equal(normalizeSearchMode("keyword"), SEARCH_MODES.KEYWORD);
  assert.equal(normalizeSearchMode("키워드"), SEARCH_MODES.KEYWORD);
});
