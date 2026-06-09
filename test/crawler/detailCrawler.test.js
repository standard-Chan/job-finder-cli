const assert = require("node:assert/strict");
const test = require("node:test");

const { parseJobDetail } = require("../../src/crawler/detailCrawler");

test("parseJobDetail extracts normalized body text", () => {
  const detail = parseJobDetail(`
    <html>
      <body>
        <article>
          Backend
          Engineer
        </article>
      </body>
    </html>
  `);

  assert.deepEqual(detail, { rawText: "Backend Engineer" });
});
