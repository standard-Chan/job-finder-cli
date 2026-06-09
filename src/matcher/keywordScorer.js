const positiveRules = [
  { keyword: "신입", score: 30 },
  { keyword: "경력 무관", score: 30 },
  { keyword: "주니어", score: 20 },
  { keyword: "백엔드", score: 30 },
  { keyword: "Backend", score: 30 },
  { keyword: "Back-end", score: 30 },
  { keyword: "서버", score: 20 },
  { keyword: "Java", score: 20 },
  { keyword: "Spring", score: 25 },
  { keyword: "Spring Boot", score: 30 },
  { keyword: "Node.js", score: 20 },
  { keyword: "NestJS", score: 20 },
  { keyword: "SQL", score: 10 },
  { keyword: "MySQL", score: 10 },
  { keyword: "AWS", score: 10 },
  { keyword: "Docker", score: 10 },
];

const negativeRules = [
  { keyword: "3년 이상", score: -40 },
  { keyword: "5년 이상", score: -70 },
  { keyword: "시니어", score: -70 },
  { keyword: "리드", score: -50 },
  { keyword: "프론트엔드", score: -30 },
  { keyword: "마케팅", score: -50 },
  { keyword: "영업", score: -50 },
  { keyword: "디자인", score: -50 },
];

function resolveActivePositiveRules(query) {
  const queryText = query.toLowerCase();
  const activeRules = positiveRules.filter((rule) =>
    queryText.includes(rule.keyword.toLowerCase())
  );

  return activeRules.length > 0 ? activeRules : positiveRules;
}

function scoreJob(job, query) {
  const text = `${job.title} ${job.raw_text}`.toLowerCase();
  const activePositiveRules = resolveActivePositiveRules(query);
  let score = 0;
  const matchedKeywords = [];
  const warningKeywords = [];

  for (const rule of activePositiveRules) {
    if (text.includes(rule.keyword.toLowerCase())) {
      score += rule.score;
      matchedKeywords.push(rule.keyword);
    }
  }

  for (const rule of negativeRules) {
    if (text.includes(rule.keyword.toLowerCase())) {
      score += rule.score;
      warningKeywords.push(rule.keyword);
    }
  }

  return {
    id: job.id,
    title: job.title,
    company: job.company,
    url: job.url,
    score,
    matchedKeywords,
    warningKeywords,
  };
}

function findMatchedJobs(jobs, query, minScore = 50) {
  return jobs
    .map((job) => scoreJob(job, query))
    .filter((result) => result.score >= minScore)
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  findMatchedJobs,
  negativeRules,
  positiveRules,
  resolveActivePositiveRules,
  scoreJob,
};
