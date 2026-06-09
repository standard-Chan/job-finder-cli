const axios = require("axios");
const cheerio = require("cheerio");

function parseJobDetail(html) {
  const $ = cheerio.load(html);
  const content = $("main").first().length > 0 ? $("main").first() : $("body");
  const rawText = content.text().replace(/\s+/g, " ").trim();

  return {
    rawText,
  };
}

async function fetchJobDetail(url) {
  const response = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
    timeout: 10000,
  });

  return parseJobDetail(response.data);
}

module.exports = {
  fetchJobDetail,
  parseJobDetail,
};
