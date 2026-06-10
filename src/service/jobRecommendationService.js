const { parseCareerType, parseDeadline, formatDate } = require("../crawler/jobMetadataParser");
const { findMatchedJobs, SEARCH_MODES, scoreJob } = require("../matcher/keywordScorer");
const {
  createContentHash,
  createDocumentInput,
  createEmbedding,
  createQueryInput,
} = require("../vector/embeddingService");
const { VectorRepository } = require("../vector/vectorRepository");

const CAREER_FILTERS = {
  ENTRY: "entry",
  EXPERIENCED: "experienced",
  ALL: "all",
};

const QUERY_OPERATORS = {
  OR: "or",
  AND: "and",
};

function normalizeCareerFilter(input) {
  const value = String(input || "").trim().toLowerCase();

  if (value === "2" || value === "experienced" || value === "경력") {
    return CAREER_FILTERS.EXPERIENCED;
  }

  if (value === "3" || value === "all" || value === "전체") {
    return CAREER_FILTERS.ALL;
  }

  return CAREER_FILTERS.ENTRY;
}

function normalizeQueryOperator(input) {
  const value = String(input || "").trim().toLowerCase();

  if (value === "2" || value === "and") {
    return QUERY_OPERATORS.AND;
  }

  return QUERY_OPERATORS.OR;
}

function splitQueryConditions(query) {
  return String(query || "")
    .split(",")
    .map((condition) => condition.trim())
    .filter(Boolean);
}

async function prepareSearch(jobRepository, options = {}) {
  const today = options.today || formatDate(new Date());
  const jobs = jobRepository.findAll();
  const onProgress = options.onProgress || (() => {});
  let updatedMetadataCount = 0;

  onProgress({
    type: "search:metadata:start",
    total: jobs.length,
  });
  for (const job of jobs) {
    if (needsMetadataBackfill(job)) {
      const deadline = parseDeadline(job.raw_text, new Date(`${today}T00:00:00+09:00`));
      const careerType = parseCareerType(job.title, job.raw_text);

      jobRepository.updateMetadata(job.id, {
        ...deadline,
        careerType,
      });
      updatedMetadataCount += 1;
    }
  }
  onProgress({
    type: "search:metadata:complete",
    total: jobs.length,
    updatedCount: updatedMetadataCount,
  });

  return prepareVectorSearch(jobRepository, options);
}

async function prepareVectorSearch(jobRepository, options = {}) {
  if (options.searchMode === SEARCH_MODES.KEYWORD) {
    return { semanticAvailable: false };
  }

  try {
    const vectorRepository = options.vectorRepository || new VectorRepository(jobRepository.db);
    emitProgress(options, {
      type: "embedding:store:start",
    });
    vectorRepository.initialize();

    if (options.skipEmbeddingBackfill) {
      emitProgress(options, {
        type: "embedding:skip",
      });
      return { semanticAvailable: true, vectorRepository };
    }

    await backfillEmbeddings(jobRepository, vectorRepository, options);

    return { semanticAvailable: true, vectorRepository };
  } catch (error) {
    emitProgress(options, {
      type: "embedding:failed",
      message: error.message,
    });
    return {
      semanticAvailable: false,
      fallbackReason: error.message,
    };
  }
}

async function backfillEmbeddings(jobRepository, vectorRepository, options = {}) {
  const createEmbeddingFn = options.createEmbedding || createEmbedding;
  const jobs = jobRepository.findAll();
  const startedAt = Date.now();
  let reusedCount = 0;
  let createdCount = 0;
  let modelLoadNotified = false;

  emitProgress(options, {
    type: "embedding:start",
    total: jobs.length,
  });

  for (const [index, job] of jobs.entries()) {
    const current = index + 1;
    const input = createDocumentInput(job);
    const contentHash = createContentHash(input);
    const savedEmbedding = jobRepository.findEmbedding(job.id);

    if (savedEmbedding && savedEmbedding.content_hash === contentHash) {
      vectorRepository.save(job.id, savedEmbedding.embedding);
      reusedCount += 1;
      emitProgress(options, createEmbeddingProgressEvent({
        current,
        total: jobs.length,
        title: job.title,
        status: "reused",
        reusedCount,
        createdCount,
        startedAt,
      }));
      continue;
    }

    if (!modelLoadNotified) {
      emitProgress(options, {
        type: "embedding:model:loading",
      });
      modelLoadNotified = true;
    }

    const embedding = await createEmbeddingFn(input);
    jobRepository.saveEmbedding(job.id, embedding);
    vectorRepository.save(job.id, embedding.embedding);
    createdCount += 1;
    emitProgress(options, createEmbeddingProgressEvent({
      current,
      total: jobs.length,
      title: job.title,
      status: "created",
      reusedCount,
      createdCount,
      startedAt,
    }));
  }

  emitProgress(options, {
    type: "embedding:complete",
    total: jobs.length,
    reusedCount,
    createdCount,
    elapsedMs: Date.now() - startedAt,
  });
}

async function recommendJobs(jobRepository, query, options = {}) {
  const today = options.today || formatDate(new Date());
  const searchMode = options.searchMode || SEARCH_MODES.SEMANTIC;
  const careerFilter = options.careerFilter || CAREER_FILTERS.ENTRY;
  const queryOperator = options.queryOperator || QUERY_OPERATORS.OR;
  const searchableJobs = jobRepository.findSearchable(today, careerFilter);
  const conditions = splitQueryConditions(query);

  if (searchMode === SEARCH_MODES.SEMANTIC && options.semanticAvailable && options.vectorRepository) {
    try {
      return {
        fallbackUsed: false,
        results: await semanticSearch(searchableJobs, conditions, queryOperator, options),
      };
    } catch (error) {
      emitProgress(options, {
        type: "search:fallback",
        message: error.message,
      });
      return {
        fallbackUsed: true,
        fallbackReason: error.message,
        results: keywordSearch(searchableJobs, query, {
          searchMode: SEARCH_MODES.SEMANTIC,
          queryOperator,
          onProgress: options.onProgress,
        }),
      };
    }
  }

  return {
    fallbackUsed: searchMode === SEARCH_MODES.SEMANTIC,
    fallbackReason: options.fallbackReason,
    results: keywordSearch(searchableJobs, query, {
      searchMode,
      queryOperator,
      onProgress: options.onProgress,
    }),
  };
}

async function semanticSearch(jobs, conditions, queryOperator, options) {
  const createEmbeddingFn = options.createEmbedding || createEmbedding;
  const vectorRepository = options.vectorRepository;
  const jobMap = new Map(jobs.map((job) => [job.id, job]));
  const conditionMatches = [];
  const startedAt = Date.now();

  emitProgress(options, {
    type: "search:semantic:start",
    total: conditions.length,
    jobCount: jobs.length,
  });

  for (const [index, condition] of conditions.entries()) {
    const embedding = await createEmbeddingFn(createQueryInput(condition));
    const matches = vectorRepository.search(embedding.embedding, options.limit || 50)
      .filter((match) => jobMap.has(match.job_posting_id));
    conditionMatches.push({ condition, matches });
    emitProgress(options, {
      type: "search:semantic:progress",
      current: index + 1,
      total: conditions.length,
      condition,
      matchedCount: matches.length,
      estimatedRemainingMs: estimateRemainingMs(startedAt, index + 1, conditions.length),
    });
  }

  const results = mergeSemanticMatches(jobMap, conditionMatches, queryOperator);
  emitProgress(options, {
    type: "search:semantic:complete",
    total: conditions.length,
    resultCount: results.length,
    elapsedMs: Date.now() - startedAt,
  });

  return results;
}

function mergeSemanticMatches(jobMap, conditionMatches, queryOperator) {
  const merged = new Map();

  for (const { condition, matches } of conditionMatches) {
    for (const match of matches) {
      const job = jobMap.get(match.job_posting_id);
      const current = merged.get(job.id) || createResult(job);

      current.semanticMatches.push({
        condition,
        distance: match.distance,
        similarityLevel: getSimilarityLevel(match.distance),
      });
      current.distance = Math.min(current.distance ?? match.distance, match.distance);
      merged.set(job.id, current);
    }
  }

  return Array.from(merged.values())
    .filter((result) => matchesOperator(result.semanticMatches, conditionMatches, queryOperator))
    .map(addKeywordEvidence)
    .sort((a, b) => a.distance - b.distance);
}

function keywordSearch(jobs, query, options = {}) {
  emitProgress(options, {
    type: "search:keyword:start",
    jobCount: jobs.length,
  });
  const conditions = splitQueryConditions(query);
  const matches = findMatchedJobs(jobs, query, 0, {
    searchMode: SEARCH_MODES.SEMANTIC,
  }).filter((result) => matchesKeywordOperator(result, conditions, options.queryOperator));

  const results = matches.map((result) => ({
    ...result,
    deadlineText: result.deadlineText || result.deadline_text || "-",
    similarityLevel: result.score > 0 ? "보통" : "낮음",
    semanticMatches: [],
  }));

  emitProgress(options, {
    type: "search:keyword:complete",
    resultCount: results.length,
  });

  return results;
}

function addKeywordEvidence(result) {
  const keywordResult = scoreJob(result, "");

  return {
    ...result,
    matchedKeywords: keywordResult.matchedKeywords,
    warningKeywords: keywordResult.warningKeywords,
    similarityLevel: getSimilarityLevel(result.distance),
  };
}

function createResult(job) {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    url: job.url,
    raw_text: job.raw_text,
    deadlineText: job.deadline_text || "-",
    matchedKeywords: [],
    warningKeywords: [],
    semanticMatches: [],
  };
}

function matchesOperator(matches, conditionMatches, queryOperator) {
  if (queryOperator !== QUERY_OPERATORS.AND) {
    return matches.length > 0;
  }

  const matchedConditions = new Set(matches.map((match) => match.condition));
  return conditionMatches.every(({ condition }) => matchedConditions.has(condition));
}

function matchesKeywordOperator(result, conditions, queryOperator) {
  if (conditions.length === 0) {
    return result.matchedKeywords.length > 0;
  }

  const text = `${result.title} ${result.raw_text || ""}`.toLowerCase();

  if (queryOperator === QUERY_OPERATORS.AND) {
    return conditions.every((condition) => text.includes(condition.toLowerCase()));
  }

  return conditions.some((condition) => text.includes(condition.toLowerCase())) ||
    result.matchedKeywords.length > 0;
}

function needsMetadataBackfill(job) {
  return !job.deadline_kind || job.deadline_kind === "unknown" || !job.career_type;
}

function getSimilarityLevel(distance) {
  if (distance <= 0.25) {
    return "높음";
  }

  if (distance <= 0.4) {
    return "보통";
  }

  return "낮음";
}

function createEmbeddingProgressEvent(progress) {
  return {
    type: "embedding:progress",
    current: progress.current,
    total: progress.total,
    title: progress.title,
    status: progress.status,
    reusedCount: progress.reusedCount,
    createdCount: progress.createdCount,
    estimatedRemainingMs: estimateRemainingMs(progress.startedAt, progress.current, progress.total),
  };
}

function estimateRemainingMs(startedAt, current, total) {
  if (current <= 0 || total <= current) {
    return 0;
  }

  const elapsedMs = Date.now() - startedAt;
  const averageMs = elapsedMs / current;

  return Math.max(Math.round(averageMs * (total - current)), 0);
}

function emitProgress(options, event) {
  if (typeof options.onProgress === "function") {
    options.onProgress(event);
  }
}

module.exports = {
  CAREER_FILTERS,
  QUERY_OPERATORS,
  backfillEmbeddings,
  createEmbeddingProgressEvent,
  estimateRemainingMs,
  getSimilarityLevel,
  keywordSearch,
  normalizeCareerFilter,
  normalizeQueryOperator,
  prepareSearch,
  recommendJobs,
  splitQueryConditions,
};
