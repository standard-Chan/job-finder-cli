const assert = require("node:assert/strict");
const test = require("node:test");

const {
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
