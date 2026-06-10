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

test("openDatabase migrates existing tables without deleting postings", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "job-finder-migrate-"));
  const dataDir = path.join(cwd, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "job-finder.db");
  const legacy = require("better-sqlite3")(dbPath);

  legacy.exec(`
    CREATE TABLE job_postings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      company TEXT,
      url TEXT NOT NULL UNIQUE,
      raw_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE job_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_posting_id INTEGER NOT NULL UNIQUE,
      embedding_model TEXT NOT NULL,
      embedding TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO job_postings (source, title, company, url, raw_text)
    VALUES ('inthiswork', '회사｜Backend', '회사', 'https://example.com/job', 'Spring');
  `);
  legacy.close();

  const migrated = openDatabase({ cwd });
  const repository = new JobRepository(migrated);
  const rows = repository.findAll();

  assert.equal(rows.length, 1);
  assert.equal(rows[0].deadline_kind, "unknown");
  assert.equal(rows[0].career_type, "unknown");

  repository.saveSearchHistory("Kafka", 2, {
    searchMode: "keyword",
    careerFilter: "all",
    queryOperator: "and",
  });
  const history = migrated.prepare("SELECT * FROM search_history").get();

  assert.equal(history.search_mode, "keyword");
  assert.equal(history.career_filter, "all");
  assert.equal(history.query_operator, "and");
  migrated.close();
});
