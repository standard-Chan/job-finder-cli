const crypto = require("node:crypto");

const DEFAULT_MODEL = "Xenova/multilingual-e5-small";

let extractorPromise = null;

async function createEmbedding(text, options = {}) {
  const model = options.model || DEFAULT_MODEL;
  const extractor = options.extractor || await loadExtractor(model);
  const output = await extractor(text, {
    pooling: "mean",
    normalize: true,
  });
  const values = Array.from(output.data);

  return {
    embeddingModel: model,
    embedding: values,
    contentHash: createContentHash(text),
    status: "ready",
  };
}

function createDocumentInput(job) {
  return `passage: ${job.title}\n${job.raw_text || job.rawText || ""}`;
}

function createQueryInput(query) {
  return `query: ${query}`;
}

function createContentHash(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function loadExtractor(model) {
  if (!extractorPromise) {
    extractorPromise = import("@huggingface/transformers").then(({ pipeline }) =>
      pipeline("feature-extraction", model)
    );
  }

  return extractorPromise;
}

module.exports = {
  DEFAULT_MODEL,
  createContentHash,
  createDocumentInput,
  createEmbedding,
  createQueryInput,
};
