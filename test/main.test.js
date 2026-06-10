const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createProgressBar,
  createEmbeddingProgressMessage,
  createProgressMessage,
  createProgressPrinter,
  createSemanticSearchProgressMessage,
  formatDuration,
  formatProgressLine,
  normalizeMaxPage,
  normalizeQuery,
  normalizeSearchMode,
  printProgress,
  printResults,
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

test("formatProgressLine truncates long job titles to terminal width", () => {
  const line = formatProgressLine(
    "[페이지 1/1] [==========          ] 20/40 아주 긴 공고 제목입니다 아주 긴 공고 제목입니다",
    40
  );

  assert.equal(line.length <= 39, true);
  assert.equal(line.includes("…"), true);
});

test("createProgressMessage omits status text and keeps only job title", () => {
  const message = createProgressMessage({
    type: "job:progress",
    page: 1,
    maxPage: 1,
    current: 1,
    total: 2,
    status: "saved",
    title: "회사｜Backend Engineer",
  });

  assert.equal(message.includes("저장"), false);
  assert.equal(message.includes("회사｜Backend Engineer"), true);
});

test("progress messages show embedding and search estimates", () => {
  assert.equal(formatDuration(0), "0초");
  assert.equal(formatDuration(61000), "1분 1초");

  const embeddingMessage = createEmbeddingProgressMessage({
    current: 2,
    total: 4,
    createdCount: 1,
    reusedCount: 1,
    estimatedRemainingMs: 30000,
    title: "회사｜Backend Engineer",
  });
  const searchMessage = createSemanticSearchProgressMessage({
    current: 1,
    total: 2,
    condition: "Kafka",
    matchedCount: 3,
    estimatedRemainingMs: 1000,
  });

  assert.equal(embeddingMessage.includes("임베딩중"), true);
  assert.equal(embeddingMessage.includes("남은 예상 30초"), true);
  assert.equal(searchMessage.includes("검색중"), true);
  assert.equal(searchMessage.includes("\"Kafka\" 매칭 3개"), true);
});

test("printProgress renders embedding progress events", () => {
  const writes = [];
  const updates = [];
  const output = {
    writeLine(message) {
      writes.push(message);
    },
    updateJobLine(message) {
      updates.push(message);
    },
  };

  printProgress({ type: "embedding:start", total: 3 }, output);
  printProgress({
    type: "embedding:progress",
    current: 1,
    total: 3,
    createdCount: 1,
    reusedCount: 0,
    estimatedRemainingMs: 2000,
    title: "첫 공고",
  }, output);
  printProgress({ type: "search:keyword:complete", resultCount: 2 }, output);

  assert.deepEqual(writes, [
    "임베딩 확인 중... 저장 공고 3개",
    "키워드 검색 완료: 결과 2개",
  ]);
  assert.equal(updates[0].includes("임베딩중"), true);
  assert.equal(updates[0].includes("첫 공고"), true);
});

test("printResults prints deadline and similarity without score", () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (message = "") => {
    logs.push(message);
  };

  try {
    printResults([
      {
        title: "회사｜Backend Engineer",
        company: "회사",
        deadlineText: "2026.07.31까지",
        similarityLevel: "높음",
        matchedKeywords: ["Spring"],
        semanticMatches: [{ condition: "백엔드", similarityLevel: "높음" }],
        warningKeywords: ["3년 이상"],
        url: "https://example.com/job",
      },
    ]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(logs.some((line) => String(line).startsWith("점수:")), false);
  assert.equal(logs.includes("접수기간: 2026.07.31까지"), true);
  assert.equal(logs.includes("유사도: 높음"), true);
  assert.equal(logs.includes("매칭: Spring, 의미:백엔드(높음)"), true);
});
