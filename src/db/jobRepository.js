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
      (source, title, company, url, raw_text, deadline_text, deadline_date, deadline_kind, career_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.findAllStmt = db.prepare(`
      SELECT id, source, title, company, url, raw_text, deadline_text, deadline_date,
        deadline_kind, career_type, created_at
      FROM job_postings
      ORDER BY id DESC
    `);

    this.findByIdStmt = db.prepare(`
      SELECT id, source, title, company, url, raw_text, deadline_text, deadline_date,
        deadline_kind, career_type, created_at
      FROM job_postings
      WHERE id = ?
    `);

    this.findByUrlStmt = db.prepare(`
      SELECT id, source, title, company, url, raw_text, deadline_text, deadline_date,
        deadline_kind, career_type, created_at
      FROM job_postings
      WHERE url = ?
    `);

    this.updateMetadataStmt = db.prepare(`
      UPDATE job_postings
      SET deadline_text = ?,
        deadline_date = ?,
        deadline_kind = ?,
        career_type = ?
      WHERE id = ?
    `);

    this.saveSearchHistoryStmt = db.prepare(`
      INSERT INTO search_history (query, result_count, search_mode, career_filter, query_operator)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.saveEmbeddingStmt = db.prepare(`
      INSERT INTO job_embeddings
        (job_posting_id, embedding_model, embedding, content_hash, status)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(job_posting_id) DO UPDATE SET
        embedding_model = excluded.embedding_model,
        embedding = excluded.embedding,
        content_hash = excluded.content_hash,
        status = excluded.status,
        created_at = CURRENT_TIMESTAMP
    `);

    this.findEmbeddingStmt = db.prepare(`
      SELECT job_posting_id, embedding_model, embedding, content_hash, status
      FROM job_embeddings
      WHERE job_posting_id = ?
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
      job.rawText,
      job.deadlineText || null,
      job.deadlineDate || null,
      job.deadlineKind || "unknown",
      job.careerType || "unknown"
    );

    return {
      inserted: result.changes === 1,
    };
  }

  findAll() {
    return this.findAllStmt.all();
  }

  findById(id) {
    return this.findByIdStmt.get(id);
  }

  findByUrl(url) {
    return this.findByUrlStmt.get(url);
  }

  findSearchable(today, careerFilter = "entry") {
    return this.findAll().filter((job) => {
      if (!isOpenForSearch(job, today)) {
        return false;
      }

      return matchesCareerFilter(job.career_type, careerFilter);
    });
  }

  updateMetadata(id, metadata) {
    this.updateMetadataStmt.run(
      metadata.deadlineText || null,
      metadata.deadlineDate || null,
      metadata.deadlineKind || "unknown",
      metadata.careerType || "unknown",
      id
    );
  }

  saveEmbedding(jobPostingId, embedding) {
    this.saveEmbeddingStmt.run(
      jobPostingId,
      embedding.embeddingModel,
      JSON.stringify(Array.from(embedding.embedding || [])),
      embedding.contentHash || null,
      embedding.status || "ready"
    );
  }

  findEmbedding(jobPostingId) {
    const row = this.findEmbeddingStmt.get(jobPostingId);

    if (!row) {
      return null;
    }

    return {
      ...row,
      embedding: JSON.parse(row.embedding),
    };
  }

  saveSearchHistory(query, resultCount, options = {}) {
    this.saveSearchHistoryStmt.run(
      query,
      resultCount,
      options.searchMode || "semantic",
      options.careerFilter || "entry",
      options.queryOperator || "or"
    );
  }
}

function isOpenForSearch(job, today) {
  if (job.deadline_kind === "open_ended") {
    return true;
  }

  if (job.deadline_kind !== "date") {
    return false;
  }

  return job.deadline_date >= today;
}

function matchesCareerFilter(careerType, careerFilter) {
  if (careerFilter === "all") {
    return true;
  }

  if (careerType === "any") {
    return true;
  }

  return careerType === careerFilter;
}

module.exports = {
  JobRepository,
  isOpenForSearch,
  matchesCareerFilter,
};
