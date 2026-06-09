const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createProgressBar,
  createProgressPrinter,
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

test("createProgressBar renders current job progress", () => {
  assert.equal(createProgressBar(2, 4, 10), "[=====     ] 2/4");
});

test("createProgressPrinter updates job progress on one line", () => {
  const writes = [];
  const output = {
    columns: 80,
    write(text) {
      writes.push(text);
    },
  };
  const printer = createProgressPrinter(output);

  printer.printProgress({
    type: "page:start",
    page: 1,
    maxPage: 1,
  });
  printer.printProgress({
    type: "page:complete",
    page: 1,
    maxPage: 1,
    totalJobs: 2,
  });
  printer.printProgress({
    type: "job:progress",
    page: 1,
    maxPage: 1,
    current: 1,
    total: 2,
    title: "첫 번째 공고",
  });
  printer.printProgress({
    type: "job:progress",
    page: 1,
    maxPage: 1,
    current: 2,
    total: 2,
    title: "두 번째 공고",
  });
  printer.finish();

  assert.equal(writes[0], "[페이지 1/1] 목록 조회 중...\n");
  assert.equal(writes[1], "[페이지 1/1] 공고 2개 확인 시작\n");
  assert.equal(writes[2].startsWith("\r[페이지 1/1] [==========          ] 1/2 첫 번째 공고"), true);
  assert.equal(writes[3].startsWith("\r[페이지 1/1] [====================] 2/2 두 번째 공고"), true);
  assert.equal(writes[4], "\n");
});
