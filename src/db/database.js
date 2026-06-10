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
  const db = createDatabaseConnection(dbPath);

  db.pragma("foreign_keys = ON");
  createTables(db);
  migrateTables(db);

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
      deadline_text TEXT,
      deadline_date TEXT,
      deadline_kind TEXT NOT NULL DEFAULT 'unknown',
      career_type TEXT NOT NULL DEFAULT 'unknown',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      search_mode TEXT NOT NULL DEFAULT 'semantic',
      career_filter TEXT NOT NULL DEFAULT 'entry',
      query_operator TEXT NOT NULL DEFAULT 'or',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS job_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_posting_id INTEGER NOT NULL UNIQUE,
      embedding_model TEXT NOT NULL,
      embedding TEXT NOT NULL,
      content_hash TEXT,
      status TEXT NOT NULL DEFAULT 'ready',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_posting_id) REFERENCES job_postings(id)
    );

    CREATE INDEX IF NOT EXISTS idx_job_postings_created_at
    ON job_postings(created_at);

    CREATE INDEX IF NOT EXISTS idx_search_history_created_at
    ON search_history(created_at);
  `);
}

function migrateTables(db) {
  addColumnIfMissing(db, "job_postings", "deadline_text", "TEXT");
  addColumnIfMissing(db, "job_postings", "deadline_date", "TEXT");
  addColumnIfMissing(db, "job_postings", "deadline_kind", "TEXT NOT NULL DEFAULT 'unknown'");
  addColumnIfMissing(db, "job_postings", "career_type", "TEXT NOT NULL DEFAULT 'unknown'");
  addColumnIfMissing(db, "search_history", "search_mode", "TEXT NOT NULL DEFAULT 'semantic'");
  addColumnIfMissing(db, "search_history", "career_filter", "TEXT NOT NULL DEFAULT 'entry'");
  addColumnIfMissing(db, "search_history", "query_operator", "TEXT NOT NULL DEFAULT 'or'");
  addColumnIfMissing(db, "job_embeddings", "content_hash", "TEXT");
  addColumnIfMissing(db, "job_embeddings", "status", "TEXT NOT NULL DEFAULT 'ready'");
}

function addColumnIfMissing(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();

  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function createDatabaseConnection(dbPath) {
  try {
    return new Database(dbPath);
  } catch (error) {
    if (isNativeModuleLoadError(error)) {
      throw new Error(
        [
          "better-sqlite3 native module load failed.",
          "Windows와 WSL/Linux는 node_modules를 공유할 수 없습니다.",
          "Windows에서 실행한다면 Windows 터미널에서 `rmdir /s /q node_modules && npm install`을 실행하세요.",
          "WSL에서 실행한다면 WSL 터미널에서 `rm -rf node_modules && npm install`을 실행하세요.",
          `원본 오류: ${error.message}`,
        ].join("\n")
      );
    }

    throw error;
  }
}

function isNativeModuleLoadError(error) {
  return error && error.code === "ERR_DLOPEN_FAILED";
}

module.exports = {
  openDatabase,
};
