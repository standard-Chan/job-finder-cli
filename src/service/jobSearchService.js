const { fetchJobLinks } = require("../crawler/listCrawler");
const { fetchJobDetail } = require("../crawler/detailCrawler");
const { parseCareerType, parseDeadline } = require("../crawler/jobMetadataParser");

function extractCompany(title) {
  if (!title.includes("｜")) {
    return "";
  }

  return title.split("｜")[0].trim();
}

async function syncNewJobs(jobRepository, maxPage, options = {}) {
  const listCrawler = options.fetchJobLinks || fetchJobLinks;
  const detailCrawler = options.fetchJobDetail || fetchJobDetail;
  const onProgress = options.onProgress || (() => {});
  const sleepMs = options.sleepMs ?? 500;
  let savedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let page = 1; page <= maxPage; page += 1) {
    let links;

    try {
      onProgress({
        type: "page:start",
        page,
        maxPage,
      });
      links = await listCrawler(page);
      onProgress({
        type: "page:complete",
        page,
        maxPage,
        totalJobs: links.length,
      });
    } catch (error) {
      failedCount += 1;
      onProgress({
        type: "page:failed",
        page,
        maxPage,
      });
      continue;
    }

    for (const [index, link] of links.entries()) {
      if (jobRepository.existsByUrl(link.url)) {
        skippedCount += 1;
        onProgress(createJobProgressEvent(link, {
          page,
          maxPage,
          current: index + 1,
          total: links.length,
          status: "skipped",
        }));
        continue;
      }

      try {
        const detail = await detailCrawler(link.url);
        const deadline = parseDeadline(detail.rawText);
        const careerType = parseCareerType(link.title, detail.rawText);
        const result = jobRepository.save({
          source: "inthiswork",
          title: link.title,
          company: extractCompany(link.title),
          url: link.url,
          rawText: detail.rawText,
          ...deadline,
          careerType,
        });

        if (result.inserted) {
          const savedJob = typeof jobRepository.findByUrl === "function"
            ? jobRepository.findByUrl(link.url)
            : null;
          await saveEmbeddingIfPossible(jobRepository, savedJob ? savedJob.id : null, {
            title: link.title,
            raw_text: detail.rawText,
          }, options);
          savedCount += 1;
          onProgress(createJobProgressEvent(link, {
            page,
            maxPage,
            current: index + 1,
            total: links.length,
            status: "saved",
          }));
        } else {
          skippedCount += 1;
          onProgress(createJobProgressEvent(link, {
            page,
            maxPage,
            current: index + 1,
            total: links.length,
            status: "skipped",
          }));
        }
      } catch (error) {
        failedCount += 1;
        onProgress(createJobProgressEvent(link, {
          page,
          maxPage,
          current: index + 1,
          total: links.length,
          status: "failed",
        }));
      }

      if (sleepMs > 0) {
        await sleep(sleepMs);
      }
    }
  }

  return {
    savedCount,
    skippedCount,
    failedCount,
  };
}

async function saveEmbeddingIfPossible(jobRepository, jobPostingId, job, options) {
  if (!options.vectorRepository || !options.createEmbedding || !jobPostingId) {
    return;
  }

  try {
    const input = options.createDocumentInput
      ? options.createDocumentInput(job)
      : `passage: ${job.title}\n${job.raw_text}`;
    const embedding = await options.createEmbedding(input);

    jobRepository.saveEmbedding(jobPostingId, embedding);
    options.vectorRepository.save(jobPostingId, embedding.embedding);
  } catch (error) {
    if (typeof options.onEmbeddingFailure === "function") {
      options.onEmbeddingFailure(error);
    }
  }
}

function createJobProgressEvent(link, progress) {
  return {
    type: "job:progress",
    page: progress.page,
    maxPage: progress.maxPage,
    current: progress.current,
    total: progress.total,
    title: link.title,
    url: link.url,
    status: progress.status,
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

module.exports = {
  createJobProgressEvent,
  extractCompany,
  saveEmbeddingIfPossible,
  sleep,
  syncNewJobs,
};
