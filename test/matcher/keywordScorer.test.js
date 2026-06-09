const assert = require("node:assert/strict");
const test = require("node:test");

const {
  findMatchedJobs,
  resolveActivePositiveRules,
  scoreJob,
} = require("../../src/matcher/keywordScorer");

test("resolveActivePositiveRules uses query keywords when known keywords exist", () => {
  const rules = resolveActivePositiveRules("백엔드 신입 Spring");
  assert.deepEqual(
    rules.map((rule) => rule.keyword),
    ["신입", "백엔드", "Spring"]
  );
});

test("scoreJob adds points only when active query keywords appear in job text", () => {
  const result = scoreJob(
    {
      id: 1,
      title: "회사｜Backend Engineer",
      company: "회사",
      url: "https://inthiswork.com/archives/1",
      raw_text: "Spring Boot AWS",
    },
    "백엔드 신입 Spring"
  );

  assert.equal(result.score, 25);
  assert.deepEqual(result.matchedKeywords, ["Spring"]);
});

test("scoreJob uses all positive rules when query has no known keyword and subtracts warning keywords", () => {
  const result = scoreJob(
    {
      id: 2,
      title: "회사｜서버 개발자",
      company: "회사",
      url: "https://inthiswork.com/archives/2",
      raw_text: "Node.js AWS 3년 이상",
    },
    "좋은 회사"
  );

  assert.equal(result.score, 10);
  assert.deepEqual(result.matchedKeywords, ["서버", "Node.js", "AWS"]);
  assert.deepEqual(result.warningKeywords, ["3년 이상"]);
});

test("findMatchedJobs filters by minScore and sorts by score descending", () => {
  const jobs = [
    {
      id: 1,
      title: "A",
      company: "",
      url: "https://inthiswork.com/archives/a",
      raw_text: "Spring",
    },
    {
      id: 2,
      title: "B",
      company: "",
      url: "https://inthiswork.com/archives/b",
      raw_text: "Spring Boot AWS",
    },
  ];

  const results = findMatchedJobs(jobs, "Spring AWS", 10);

  assert.deepEqual(
    results.map((result) => result.id),
    [2, 1]
  );
});
