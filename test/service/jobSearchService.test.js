const assert = require("node:assert/strict");
const test = require("node:test");

const { syncNewJobs, extractCompany } = require("../../src/service/jobSearchService");

test("extractCompany returns text before Korean vertical bar", () => {
  assert.equal(extractCompany("회사명｜Backend Engineer"), "회사명");
  assert.equal(extractCompany("Backend Engineer"), "");
});

test("syncNewJobs skips existing urls and fetches details only for new urls", async () => {
  const saved = [];
  const existing = new Set(["https://inthiswork.com/archives/existing"]);
  const repository = {
    existsByUrl(url) {
      return existing.has(url);
    },
    save(job) {
      saved.push(job);
      existing.add(job.url);
      return { inserted: true };
    },
  };

  const detailCalls = [];
  const result = await syncNewJobs(repository, 1, {
    sleepMs: 0,
    fetchJobLinks: async () => [
      {
        title: "기존회사｜Backend",
        url: "https://inthiswork.com/archives/existing",
      },
      {
        title: "새회사｜Spring Backend",
        url: "https://inthiswork.com/archives/new",
      },
    ],
    fetchJobDetail: async (url) => {
      detailCalls.push(url);
      return { rawText: "Spring Boot" };
    },
  });

  assert.deepEqual(result, {
    savedCount: 1,
    skippedCount: 1,
    failedCount: 0,
  });
  assert.deepEqual(detailCalls, ["https://inthiswork.com/archives/new"]);
  assert.equal(saved[0].company, "새회사");
});

test("syncNewJobs continues when list or detail crawling fails", async () => {
  const repository = {
    existsByUrl() {
      return false;
    },
    save() {
      return { inserted: true };
    },
  };

  const result = await syncNewJobs(repository, 2, {
    sleepMs: 0,
    fetchJobLinks: async (page) => {
      if (page === 1) {
        throw new Error("list failed");
      }

      return [
        {
          title: "회사｜Backend",
          url: "https://inthiswork.com/archives/fail-detail",
        },
      ];
    },
    fetchJobDetail: async () => {
      throw new Error("detail failed");
    },
  });

  assert.deepEqual(result, {
    savedCount: 0,
    skippedCount: 0,
    failedCount: 2,
  });
});

test("syncNewJobs reports page and job progress", async () => {
  const events = [];
  const repository = {
    existsByUrl(url) {
      return url.endsWith("/existing");
    },
    save() {
      return { inserted: true };
    },
  };

  await syncNewJobs(repository, 1, {
    sleepMs: 0,
    onProgress(event) {
      events.push(event);
    },
    fetchJobLinks: async () => [
      {
        title: "기존회사｜Backend",
        url: "https://inthiswork.com/archives/existing",
      },
      {
        title: "새회사｜Spring Backend",
        url: "https://inthiswork.com/archives/new",
      },
    ],
    fetchJobDetail: async () => ({ rawText: "Spring Boot" }),
  });

  assert.deepEqual(events, [
    { type: "page:start", page: 1, maxPage: 1 },
    { type: "page:complete", page: 1, maxPage: 1, totalJobs: 2 },
    {
      type: "job:progress",
      page: 1,
      maxPage: 1,
      current: 1,
      total: 2,
      title: "기존회사｜Backend",
      url: "https://inthiswork.com/archives/existing",
      status: "skipped",
    },
    {
      type: "job:progress",
      page: 1,
      maxPage: 1,
      current: 2,
      total: 2,
      title: "새회사｜Spring Backend",
      url: "https://inthiswork.com/archives/new",
      status: "saved",
    },
  ]);
});
