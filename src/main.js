#!/usr/bin/env node

const { createPrompt } = require("./cli/prompt");
const { openDatabase } = require("./db/database");
const { JobRepository } = require("./db/jobRepository");
const { findMatchedJobs } = require("./matcher/keywordScorer");
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

async function run() {
  const db = openDatabase();
  const jobRepository = new JobRepository(db);
  const prompt = createPrompt();

  try {
    console.log("채용공고 추천 CLI");
    console.log("====================");
    console.log();

    const queryInput = await prompt.ask("원하는 조건을 입력하세요: ");
    const maxPageInput = await prompt.ask("몇 페이지까지 새 공고를 확인할까요? 기본값 3: ");
    const query = normalizeQuery(queryInput);
    const maxPage = normalizeMaxPage(maxPageInput);

    console.log();
    console.log("새 공고 확인 중...");

    const syncResult = await syncNewJobs(jobRepository, maxPage, {
      onProgress: printProgress,
    });

    console.log(`새로 저장한 공고: ${syncResult.savedCount}개`);
    console.log(`이미 저장된 공고: ${syncResult.skippedCount}개`);
    console.log(`수집 실패: ${syncResult.failedCount}개`);

    const jobs = jobRepository.findAll();
    const results = findMatchedJobs(jobs, query, 50);

    jobRepository.saveSearchHistory(query, results.length);
    printResults(results);
  } finally {
    prompt.close();
    db.close();
  }
}

function printProgress(event) {
  if (event.type === "page:start") {
    console.log(`[페이지 ${event.page}/${event.maxPage}] 목록 조회 중...`);
    return;
  }

  if (event.type === "page:complete") {
    console.log(`[페이지 ${event.page}/${event.maxPage}] 공고 ${event.totalJobs}개 확인 시작`);
    return;
  }

  if (event.type === "page:failed") {
    console.log(`[페이지 ${event.page}/${event.maxPage}] 목록 조회 실패`);
    return;
  }

  if (event.type === "job:progress") {
    const statusLabel = {
      saved: "저장",
      skipped: "이미 있음",
      failed: "실패",
    }[event.status] || event.status;

    console.log(
      `[페이지 ${event.page}/${event.maxPage}] ` +
        `[공고 ${event.current}/${event.total}] ` +
        `${statusLabel} - ${event.title}`
    );
  }
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
  normalizeMaxPage,
  normalizeQuery,
  printProgress,
  printResults,
  run,
};
