#!/usr/bin/env node

const readline = require("node:readline");

const { createPrompt } = require("./cli/prompt");
const { openDatabase } = require("./db/database");
const { JobRepository } = require("./db/jobRepository");
const { SEARCH_MODES } = require("./matcher/keywordScorer");
const {
  normalizeCareerFilter,
  prepareSearch,
  recommendJobs,
} = require("./service/jobRecommendationService");
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

function normalizeShouldContinue(input) {
  const value = input.trim().toLowerCase();

  return !["q", "quit", "exit", "종료", "n", "no"].includes(value);
}

async function run() {
  const db = openDatabase();
  const jobRepository = new JobRepository(db);
  const prompt = createPrompt();
  const progressPrinter = createProgressPrinter(process.stdout);

  try {
    console.log("채용공고 추천 CLI");
    console.log("====================");
    console.log();

    const maxPageInput = await prompt.ask("몇 페이지까지 새 공고를 확인할까요? 기본값 3: ");
    const maxPage = normalizeMaxPage(maxPageInput);

    console.log();
    console.log("새 공고 확인 중...");

    const syncResult = await syncNewJobs(jobRepository, maxPage, {
      onProgress: progressPrinter.printProgress,
    });
    progressPrinter.finish();

    console.log(`새로 저장한 공고: ${syncResult.savedCount}개`);
    console.log(`이미 저장된 공고: ${syncResult.skippedCount}개`);
    console.log(`수집 실패: ${syncResult.failedCount}개`);

    let shouldContinue = true;

    while (shouldContinue) {
      console.log();
      const queryInput = await prompt.ask("원하는 조건을 입력하세요: ");
      const searchModeInput = await prompt.ask(
        "검색 방식을 선택하세요. 1=추천/의미 기반(기본), 2=키워드 반드시 포함: "
      );
      const careerFilterInput = await prompt.ask(
        "경력 조건을 선택하세요. 1=신입/인턴(기본), 2=경력, 3=전체: "
      );
      const query = normalizeQuery(queryInput);
      const searchMode = normalizeSearchMode(searchModeInput);
      const careerFilter = normalizeCareerFilter(careerFilterInput);

      const searchPreparation = await prepareSearch(jobRepository, {
        searchMode,
        onProgress: progressPrinter.printProgress,
      });
      const recommendation = await recommendJobs(jobRepository, query, {
        searchMode,
        careerFilter,
        semanticAvailable: searchPreparation.semanticAvailable,
        vectorRepository: searchPreparation.vectorRepository,
        fallbackReason: searchPreparation.fallbackReason,
        onProgress: progressPrinter.printProgress,
      });
      progressPrinter.finish();
      const results = recommendation.results;

      jobRepository.saveSearchHistory(query, results.length, {
        searchMode: recommendation.fallbackUsed ? SEARCH_MODES.KEYWORD : searchMode,
        careerFilter,
      });
      printResults(results, {
        fallbackUsed: recommendation.fallbackUsed,
      });

      if (!prompt.isInteractive) {
        shouldContinue = false;
        continue;
      }

      const continueInput = await prompt.ask("다시 검색할까요? Enter=계속, q=종료: ");
      shouldContinue = normalizeShouldContinue(continueInput);
    }
  } finally {
    progressPrinter.finish();
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
    const line = formatProgressLine(message, output.columns || 80);

    if (output.isTTY) {
      readline.clearLine(output, 0);
      readline.cursorTo(output, 0);
      output.write(line);
    } else {
      output.write(`\r${line}`);
    }

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
      createProgressMessage(event)
    );
    return;
  }

  if (event.type === "search:metadata:start") {
    output.writeLine(`검색 준비 중... 저장 공고 ${event.total}개 확인`);
    return;
  }

  if (event.type === "search:metadata:complete") {
    output.writeLine(`검색 준비 완료: 메타데이터 ${event.updatedCount}개 보정`);
    return;
  }

  if (event.type === "embedding:store:start") {
    output.writeLine("임베딩 저장소 준비 중...");
    return;
  }

  if (event.type === "embedding:skip") {
    output.writeLine("임베딩 백필 건너뜀");
    return;
  }

  if (event.type === "embedding:model:loading") {
    output.writeLine("임베딩 모델 로드 중... 최초 실행이면 모델 다운로드로 시간이 걸릴 수 있습니다.");
    return;
  }

  if (event.type === "embedding:start") {
    output.writeLine(`임베딩 확인 중... 저장 공고 ${event.total}개`);
    return;
  }

  if (event.type === "embedding:progress") {
    output.updateJobLine(createEmbeddingProgressMessage(event));
    return;
  }

  if (event.type === "embedding:complete") {
    output.writeLine(
      `임베딩 완료: 생성 ${event.createdCount}개, 재사용 ${event.reusedCount}개, 소요 ${formatDuration(event.elapsedMs)}`
    );
    return;
  }

  if (event.type === "embedding:failed") {
    output.writeLine(`임베딩 준비 실패: ${event.message}`);
    return;
  }

  if (event.type === "search:semantic:start") {
    output.writeLine(`검색중... 조건 ${event.total}개, 검색 대상 ${event.jobCount}개`);
    return;
  }

  if (event.type === "search:semantic:progress") {
    output.updateJobLine(createSemanticSearchProgressMessage(event));
    return;
  }

  if (event.type === "search:semantic:complete") {
    output.writeLine(`검색 완료: 결과 ${event.resultCount}개, 소요 ${formatDuration(event.elapsedMs)}`);
    return;
  }

  if (event.type === "search:keyword:start") {
    output.writeLine(`키워드 검색중... 검색 대상 ${event.jobCount}개`);
    return;
  }

  if (event.type === "search:keyword:complete") {
    output.writeLine(`키워드 검색 완료: 결과 ${event.resultCount}개`);
    return;
  }

  if (event.type === "search:fallback") {
    output.writeLine(`의미 검색 실패, 키워드 검색으로 전환: ${event.message}`);
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

function createProgressMessage(event) {
  return (
    `[페이지 ${event.page}/${event.maxPage}] ` +
    `${createProgressBar(event.current, event.total)} ` +
    `${event.title}`
  );
}

function createEmbeddingProgressMessage(event) {
  return (
    `임베딩중 ${createProgressBar(event.current, event.total)} ` +
    `생성 ${event.createdCount} 재사용 ${event.reusedCount} ` +
    `남은 예상 ${formatDuration(event.estimatedRemainingMs)} ` +
    `${event.title}`
  );
}

function createSemanticSearchProgressMessage(event) {
  return (
    `검색중 ${createProgressBar(event.current, event.total)} ` +
    `"${event.condition}" 매칭 ${event.matchedCount}개 ` +
    `남은 예상 ${formatDuration(event.estimatedRemainingMs)}`
  );
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "0초";
  }

  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}초`;
  }

  return `${minutes}분 ${seconds}초`;
}

function formatProgressLine(message, columns) {
  const maxWidth = Math.max(columns - 1, 20);
  return truncateDisplayWidth(message, maxWidth).padEnd(maxWidth);
}

function truncateDisplayWidth(text, maxWidth) {
  let width = 0;
  let result = "";

  for (const char of text) {
    const charWidth = getDisplayWidth(char);

    if (width + charWidth > maxWidth) {
      return `${result.slice(0, Math.max(result.length - 1, 0))}…`;
    }

    result += char;
    width += charWidth;
  }

  return result;
}

function getDisplayWidth(char) {
  return char.charCodeAt(0) > 255 ? 2 : 1;
}

function printResults(results, options = {}) {
  console.log();
  if (options.fallbackUsed) {
    console.log("의미 검색을 사용할 수 없어 키워드 기준으로 검색했습니다.");
    console.log();
  }

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
    console.log(`접수기간: ${job.deadlineText || "-"}`);
    console.log(`유사도: ${job.similarityLevel || "-"}`);
    console.log(`매칭: ${formatMatches(job)}`);
    console.log(`주의: ${(job.warningKeywords || []).join(", ") || "-"}`);
    console.log(`URL: ${job.url}`);
  });
}

function formatMatches(job) {
  const matches = [
    ...(job.matchedKeywords || []),
    ...(job.semanticMatches || []).map((match) => `의미:${match.condition}(${match.similarityLevel})`),
  ];

  return matches.join(", ") || "-";
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
  createEmbeddingProgressMessage,
  createProgressMessage,
  createProgressPrinter,
  createSemanticSearchProgressMessage,
  formatProgressLine,
  formatDuration,
  normalizeMaxPage,
  normalizeQuery,
  normalizeSearchMode,
  normalizeShouldContinue,
  printProgress,
  printResults,
  run,
};
