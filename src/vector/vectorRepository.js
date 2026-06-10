class VectorRepository {
  constructor(db, options = {}) {
    this.db = db;
    this.sqliteVec = options.sqliteVec || null;
    this.dimension = options.dimension || 384;
    this.ready = false;
  }

  load() {
    const sqliteVec = this.sqliteVec || require("sqlite-vec");
    const loader = sqliteVec.load || sqliteVec.default?.load;

    if (typeof loader !== "function") {
      throw new Error("sqlite-vec load function not found.");
    }

    loader(this.db);
    this.sqliteVec = sqliteVec;
    this.ready = true;
  }

  createTable() {
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS job_embedding_vec
      USING vec0(
        embedding float[${this.dimension}] distance_metric=cosine
      )
    `);
  }

  initialize() {
    this.load();
    this.createTable();
  }

  save(jobPostingId, embedding) {
    const serialized = serializeEmbedding(this.sqliteVec, embedding);

    this.db.prepare(`
      INSERT OR REPLACE INTO job_embedding_vec (rowid, embedding)
      VALUES (?, ?)
    `).run(BigInt(jobPostingId), serialized);
  }

  search(embedding, limit = 20) {
    const serialized = serializeEmbedding(this.sqliteVec, embedding);

    return this.db.prepare(`
      SELECT rowid AS job_posting_id, distance
      FROM job_embedding_vec
      WHERE embedding MATCH ? AND k = ?
      ORDER BY distance
    `).all(serialized, limit);
  }
}

function serializeEmbedding(sqliteVec, embedding) {
  const values = embedding instanceof Float32Array ? embedding : new Float32Array(embedding);

  if (sqliteVec && typeof sqliteVec.serializeFloat32 === "function") {
    return sqliteVec.serializeFloat32(values);
  }

  return JSON.stringify(Array.from(values));
}

module.exports = {
  VectorRepository,
  serializeEmbedding,
};
