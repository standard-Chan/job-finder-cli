const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { openDatabase } = require("../../src/db/database");
const { JobRepository } = require("../../src/db/jobRepository");

test("openDatabase creates data/job-finder.db and required tables without deleting data", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "job-finder-db-"));
  const db = openDatabase({ cwd });
  const repository = new JobRepository(db);

  repository.save({
    source: "inthiswork",
    title: "회사｜Backend Engineer",
    company: "회사",
    url: "https://inthiswork.com/archives/1",
    rawText: "Spring Backend",
  });
  db.close();

  const reopened = openDatabase({ cwd });
  const rows = new JobRepository(reopened).findAll();

  assert.equal(fs.existsSync(path.join(cwd, "data", "job-finder.db")), true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, "https://inthiswork.com/archives/1");
  reopened.close();
});

test("JobRepository prevents duplicate urls and saves search history", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "job-finder-repo-"));
  const db = openDatabase({ cwd });
  const repository = new JobRepository(db);

  const job = {
    source: "inthiswork",
    title: "회사｜Backend Engineer",
    company: "회사",
    url: "https://inthiswork.com/archives/2",
    rawText: "Node.js AWS",
  };

  assert.equal(repository.existsByUrl(job.url), false);
  assert.deepEqual(repository.save(job), { inserted: true });
  assert.equal(repository.existsByUrl(job.url), true);
  assert.deepEqual(repository.save(job), { inserted: false });
  assert.equal(repository.findAll().length, 1);

  repository.saveSearchHistory("백엔드 신입", 1);
  const historyCount = db.prepare("SELECT COUNT(*) AS count FROM search_history").get().count;

  assert.equal(historyCount, 1);
  db.close();
});
