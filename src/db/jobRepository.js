class JobRepository {
  constructor(db) {
    this.db = db;

    this.existsByUrlStmt = db.prepare(`
      SELECT EXISTS(
        SELECT 1 FROM job_postings WHERE url = ?
      ) AS exists_flag
    `);

    this.saveStmt = db.prepare(`
      INSERT OR IGNORE INTO job_postings
      (source, title, company, url, raw_text)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.findAllStmt = db.prepare(`
      SELECT id, source, title, company, url, raw_text, created_at
      FROM job_postings
      ORDER BY id DESC
    `);

    this.saveSearchHistoryStmt = db.prepare(`
      INSERT INTO search_history (query, result_count)
      VALUES (?, ?)
    `);
  }

  existsByUrl(url) {
    const row = this.existsByUrlStmt.get(url);
    return row.exists_flag === 1;
  }

  save(job) {
    const result = this.saveStmt.run(
      job.source,
      job.title,
      job.company,
      job.url,
      job.rawText
    );

    return {
      inserted: result.changes === 1,
    };
  }

  findAll() {
    return this.findAllStmt.all();
  }

  saveSearchHistory(query, resultCount) {
    this.saveSearchHistoryStmt.run(query, resultCount);
  }
}

module.exports = {
  JobRepository,
};
