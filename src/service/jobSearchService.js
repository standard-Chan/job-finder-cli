const { fetchJobLinks } = require("../crawler/listCrawler");
const { fetchJobDetail } = require("../crawler/detailCrawler");

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
        const result = jobRepository.save({
          source: "inthiswork",
          title: link.title,
          company: extractCompany(link.title),
          url: link.url,
          rawText: detail.rawText,
        });

        if (result.inserted) {
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
  sleep,
  syncNewJobs,
};
