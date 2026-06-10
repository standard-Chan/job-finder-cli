const assert = require("node:assert/strict");
const test = require("node:test");

const {
  backfillEmbeddings,
  getSimilarityLevel,
  keywordSearch,
  normalizeCareerFilter,
  normalizeQueryOperator,
  splitQueryConditions,
} = require("../../src/service/jobRecommendationService");

test("normalizes search filters and comma separated conditions", () => {
  assert.equal(normalizeCareerFilter(""), "entry");
  assert.equal(normalizeCareerFilter("2"), "experienced");
  assert.equal(normalizeCareerFilter("3"), "all");
  assert.equal(normalizeQueryOperator(""), "or");
  assert.equal(normalizeQueryOperator("2"), "and");
  assert.deepEqual(splitQueryConditions("Kafka, 대규모 데이터 처리"), [
    "Kafka",
    "대규모 데이터 처리",
  ]);
});

test("keywordSearch supports OR and AND over comma separated conditions", () => {
  const jobs = [
    {
      id: 1,
      title: "A",
      company: "",
      url: "https://example.com/a",
      raw_text: "Kafka Spring",
      deadline_text: "채용시까지",
    },
    {
      id: 2,
      title: "B",
      company: "",
      url: "https://example.com/b",
      raw_text: "Kafka 대규모 데이터 처리",
      deadline_text: "2026.07.31까지",
    },
  ];

  assert.deepEqual(
    keywordSearch(jobs, "Kafka, 대규모 데이터 처리", { queryOperator: "or" })
      .map((job) => job.id),
    [1, 2]
  );
  assert.deepEqual(
    keywordSearch(jobs, "Kafka, 대규모 데이터 처리", { queryOperator: "and" })
      .map((job) => job.id),
    [2]
  );
});

test("getSimilarityLevel maps cosine distance thresholds", () => {
  assert.equal(getSimilarityLevel(0.25), "높음");
  assert.equal(getSimilarityLevel(0.4), "보통");
  assert.equal(getSimilarityLevel(0.41), "낮음");
});

test("backfillEmbeddings reports reused and created progress", async () => {
  const events = [];
  const savedEmbeddings = [];
  const repository = {
    findAll() {
      return [
        {
          id: 1,
          title: "기존 공고",
          raw_text: "Spring",
        },
        {
          id: 2,
          title: "새 공고",
          raw_text: "Kafka",
        },
      ];
    },
    findEmbedding(id) {
      if (id === 1) {
        return {
          content_hash: require("../../src/vector/embeddingService")
            .createContentHash("passage: 기존 공고\nSpring"),
          embedding: [1, 0],
        };
      }

      return null;
    },
    saveEmbedding(id, embedding) {
      savedEmbeddings.push({ id, embedding });
    },
  };
  const vectorRepository = {
    saved: [],
    save(id, embedding) {
      this.saved.push({ id, embedding });
    },
  };

  await backfillEmbeddings(repository, vectorRepository, {
    onProgress(event) {
      events.push(event);
    },
    createEmbedding: async () => ({
      embeddingModel: "test",
      embedding: [0, 1],
      contentHash: "new",
      status: "ready",
    }),
  });

  assert.deepEqual(
    events.map((event) => event.type),
    [
      "embedding:start",
      "embedding:progress",
      "embedding:model:loading",
      "embedding:progress",
      "embedding:complete",
    ]
  );
  assert.equal(events[1].status, "reused");
  assert.equal(events[3].status, "created");
  assert.equal(savedEmbeddings.length, 1);
  assert.equal(vectorRepository.saved.length, 2);
});

test("keywordSearch reports progress", () => {
  const events = [];

  keywordSearch([
    {
      id: 1,
      title: "A",
      company: "",
      url: "https://example.com/a",
      raw_text: "Kafka Spring",
      deadline_text: "채용시까지",
    },
  ], "Kafka", {
    onProgress(event) {
      events.push(event);
    },
  });

  assert.deepEqual(
    events.map((event) => event.type),
    ["search:keyword:start", "search:keyword:complete"]
  );
  assert.equal(events[0].jobCount, 1);
  assert.equal(events[1].resultCount, 1);
});
