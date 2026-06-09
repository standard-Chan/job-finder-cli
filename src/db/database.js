const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

function openDatabase(options = {}) {
  const cwd = options.cwd || process.cwd();
  const dataDir = path.join(cwd, "data");

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, "job-finder.db");
  const db = new Database(dbPath);

  db.pragma("foreign_keys = ON");
  createTables(db);

  return db;
}

function createTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_postings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      company TEXT,
      url TEXT NOT NULL UNIQUE,
      raw_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS job_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_posting_id INTEGER NOT NULL UNIQUE,
      embedding_model TEXT NOT NULL,
      embedding TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_posting_id) REFERENCES job_postings(id)
    );

    CREATE INDEX IF NOT EXISTS idx_job_postings_created_at
    ON job_postings(created_at);

    CREATE INDEX IF NOT EXISTS idx_search_history_created_at
    ON search_history(created_at);
  `);
}

module.exports = {
  openDatabase,
};
