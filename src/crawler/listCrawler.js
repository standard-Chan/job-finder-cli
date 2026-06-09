const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://inthiswork.com";

function buildListUrl(page) {
  if (page === 1) {
    return `${BASE_URL}/it`;
  }

  return `${BASE_URL}/it?paged1=${page}`;
}

function normalizeUrl(href) {
  return new URL(href, BASE_URL).toString();
}

function parseJobLinks(html) {
  const $ = cheerio.load(html);
  const mainCandidates = $("main a, article a");
  const candidates = mainCandidates.length > 0 ? mainCandidates : $("a");
  const seen = new Set();
  const jobs = [];

  candidates.each((_, element) => {
    const href = $(element).attr("href");
    const title = $(element).text().replace(/\s+/g, " ").trim();

    if (!href || !href.includes("/archives/") || !title) {
      return;
    }

    const url = normalizeUrl(href);

    if (seen.has(url)) {
      return;
    }

    seen.add(url);
    jobs.push({ title, url });
  });

  return jobs;
}

async function fetchJobLinks(page) {
  const response = await axios.get(buildListUrl(page), {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
    timeout: 10000,
  });

  return parseJobLinks(response.data);
}

module.exports = {
  buildListUrl,
  fetchJobLinks,
  normalizeUrl,
  parseJobLinks,
};
