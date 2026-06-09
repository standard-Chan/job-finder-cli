const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildListUrl,
  normalizeUrl,
  parseJobLinks,
} = require("../../src/crawler/listCrawler");

test("buildListUrl builds first and paged list urls", () => {
  assert.equal(buildListUrl(1), "https://inthiswork.com/it");
  assert.equal(buildListUrl(2), "https://inthiswork.com/it?paged1=2");
});

test("normalizeUrl converts relative archive urls to absolute urls", () => {
  assert.equal(
    normalizeUrl("/archives/123"),
    "https://inthiswork.com/archives/123"
  );
});

test("parseJobLinks extracts archive links from main content and removes duplicates", () => {
  const html = `
    <main>
      <a href="/archives/123">회사 A｜Backend Engineer</a>
      <a href="/archives/123">회사 A｜Backend Engineer Duplicate</a>
      <a href="/not-job">공지</a>
    </main>
    <aside>
      <a href="/archives/999">오늘 핫한 공고</a>
    </aside>
  `;

  const links = parseJobLinks(html);

  assert.deepEqual(links, [
    {
      title: "회사 A｜Backend Engineer",
      url: "https://inthiswork.com/archives/123",
    },
  ]);
});

test("parseJobLinks falls back to archive anchors when main content is absent", () => {
  const html = `
    <div>
      <a href="/archives/777">회사 B｜Node.js Engineer</a>
      <a href="/category/it">IT</a>
    </div>
  `;

  assert.deepEqual(parseJobLinks(html), [
    {
      title: "회사 B｜Node.js Engineer",
      url: "https://inthiswork.com/archives/777",
    },
  ]);
});
