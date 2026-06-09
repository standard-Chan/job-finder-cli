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
  const url = new URL(href, BASE_URL);
  url.hash = "";
  return url.toString();
}

function parseJobLinks(html) {
  const $ = cheerio.load(html);
  const titleCandidates = $("main a.dpt-title-link[href*='/archives/']");
  const mainCandidates = $("main a[href*='/archives/']");
  const candidates = titleCandidates.length > 0
    ? titleCandidates
    : mainCandidates.length > 0
      ? mainCandidates
      : $("a[href*='/archives/']");
  const seen = new Set();
  const jobs = [];

  candidates.each((_, element) => {
    const href = $(element).attr("href");
    const title = $(element).text().replace(/\s+/g, " ").trim();

    if (!href || !isJobPostingUrl(href) || !title) {
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

function isJobPostingUrl(href) {
  const url = normalizeUrl(href);
  return /^https:\/\/inthiswork\.com\/archives\/\d+\/?$/.test(url);
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
  isJobPostingUrl,
  normalizeUrl,
  parseJobLinks,
};
