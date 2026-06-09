#!/usr/bin/env node

const { createPrompt } = require("./cli/prompt");
const { openDatabase } = require("./db/database");
const { JobRepository } = require("./db/jobRepository");
const { findMatchedJobs, SEARCH_MODES } = require("./matcher/keywordScorer");
const { syncNewJobs } = require("./service/jobSearchService");

const DEFAULT_QUERY = "백엔드 신입 Spring Node.js";
const DEFAULT_MAX_PAGE = 3;
const MAX_PAGE_LIMIT = 10;

function normalizeQuery(input) {
  return input.trim() || DEFAULT_QUERY;
}

function normalizeMaxPage(input) {
  const parsed = Number(input || DEFAULT_MAX_PAGE);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_MAX_PAGE;
  }

  return Math.min(parsed, MAX_PAGE_LIMIT);
}

function normalizeSearchMode(input) {
  const value = input.trim().toLowerCase();

  if (value === "2" || value === "keyword" || value === "키워드") {
    return SEARCH_MODES.KEYWORD;
  }

  return SEARCH_MODES.SEMANTIC;
}

async function run() {
  const db = openDatabase();
  const jobRepository = new JobRepository(db);
  const prompt = createPrompt();

  try {
    console.log("채용공고 추천 CLI");
    console.log("====================");
    console.log();

    const queryInput = await prompt.ask("원하는 조건을 입력하세요: ");
    const searchModeInput = await prompt.ask(
      "검색 방식을 선택하세요. 1=추천/의미 기반(기본), 2=키워드 반드시 포함: "
    );
    const maxPageInput = await prompt.ask("몇 페이지까지 새 공고를 확인할까요? 기본값 3: ");
    const query = normalizeQuery(queryInput);
    const searchMode = normalizeSearchMode(searchModeInput);
    const maxPage = normalizeMaxPage(maxPageInput);

    console.log();
    console.log("새 공고 확인 중...");

    const progressPrinter = createProgressPrinter(process.stdout);
    const syncResult = await syncNewJobs(jobRepository, maxPage, {
      onProgress: progressPrinter.printProgress,
    });
    progressPrinter.finish();

    console.log(`새로 저장한 공고: ${syncResult.savedCount}개`);
    console.log(`이미 저장된 공고: ${syncResult.skippedCount}개`);
    console.log(`수집 실패: ${syncResult.failedCount}개`);

    const jobs = jobRepository.findAll();
    const minScore = searchMode === SEARCH_MODES.KEYWORD ? 0 : 50;
    const results = findMatchedJobs(jobs, query, minScore, { searchMode });

    jobRepository.saveSearchHistory(query, results.length);
    printResults(results);
  } finally {
    prompt.close();
    db.close();
  }
}

function createProgressPrinter(output = process.stdout) {
  let hasActiveJobLine = false;

  function writeLine(message) {
    if (hasActiveJobLine) {
      output.write("\n");
      hasActiveJobLine = false;
    }

    output.write(`${message}\n`);
  }

  function updateJobLine(message) {
    const text = `\r${message}`;
    output.write(text.padEnd(output.columns || text.length));
    hasActiveJobLine = true;
  }

  function finish() {
    if (hasActiveJobLine) {
      output.write("\n");
      hasActiveJobLine = false;
    }
  }

  return {
    finish,
    printProgress(event) {
      printProgress(event, { writeLine, updateJobLine });
    },
  };
}

function printProgress(event, output = consoleProgressOutput) {
  if (event.type === "page:start") {
    output.writeLine(`[페이지 ${event.page}/${event.maxPage}] 목록 조회 중...`);
    return;
  }

  if (event.type === "page:complete") {
    output.writeLine(`[페이지 ${event.page}/${event.maxPage}] 공고 ${event.totalJobs}개 확인 시작`);
    return;
  }

  if (event.type === "page:failed") {
    output.writeLine(`[페이지 ${event.page}/${event.maxPage}] 목록 조회 실패`);
    return;
  }

  if (event.type === "job:progress") {
    output.updateJobLine(
      `[페이지 ${event.page}/${event.maxPage}] ` +
        `${createProgressBar(event.current, event.total)} ` +
        `${event.title}`
    );
  }
}

const consoleProgressOutput = {
  writeLine(message) {
    console.log(message);
  },
  updateJobLine(message) {
    process.stdout.write(`\r${message}`);
  },
};

function createProgressBar(current, total, width = 20) {
  const safeTotal = total > 0 ? total : 1;
  const ratio = Math.min(current / safeTotal, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;

  return `[${"=".repeat(filled)}${" ".repeat(empty)}] ${current}/${total}`;
}

function printResults(results) {
  console.log();
  console.log("추천 공고");
  console.log("====================");

  if (results.length === 0) {
    console.log("조건에 맞는 공고가 없습니다.");
    return;
  }

  results.slice(0, 10).forEach((job, index) => {
    console.log();
    console.log(`[${index + 1}] ${job.title}`);
    console.log(`회사: ${job.company || "-"}`);
    console.log(`점수: ${job.score}`);
    console.log(`매칭: ${job.matchedKeywords.join(", ") || "-"}`);
    console.log(`주의: ${job.warningKeywords.join(", ") || "-"}`);
    console.log(`URL: ${job.url}`);
  });
}

if (require.main === module) {
  run().catch((error) => {
    console.error("실행 중 오류가 발생했습니다.");
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  MAX_PAGE_LIMIT,
  DEFAULT_MAX_PAGE,
  DEFAULT_QUERY,
  createProgressBar,
  createProgressPrinter,
  normalizeMaxPage,
  normalizeQuery,
  normalizeSearchMode,
  printProgress,
  printResults,
  run,
};
