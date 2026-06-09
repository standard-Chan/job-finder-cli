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
  const sleepMs = options.sleepMs ?? 500;
  let savedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let page = 1; page <= maxPage; page += 1) {
    let links;

    try {
      links = await listCrawler(page);
    } catch (error) {
      failedCount += 1;
      continue;
    }

    for (const link of links) {
      if (jobRepository.existsByUrl(link.url)) {
        skippedCount += 1;
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
        } else {
          skippedCount += 1;
        }
      } catch (error) {
        failedCount += 1;
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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

module.exports = {
  extractCompany,
  sleep,
  syncNewJobs,
};
