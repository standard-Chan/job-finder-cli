const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const test = require("node:test");

const { VectorRepository } = require("../../src/vector/vectorRepository");

test("VectorRepository stores 384 dimension vectors and searches nearest rows", () => {
  const db = new Database(":memory:");
  const repository = new VectorRepository(db);
  const vector = Array.from({ length: 384 }, (_, index) => index === 0 ? 1 : 0);

  repository.initialize();
  repository.save(7, vector);

  const results = repository.search(vector, 1);

  assert.equal(results.length, 1);
  assert.equal(results[0].job_posting_id, 7);
  assert.equal(results[0].distance, 0);
  db.close();
});
