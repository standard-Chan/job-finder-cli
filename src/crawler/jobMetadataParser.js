const DEADLINE_KIND = {
  DATE: "date",
  OPEN_ENDED: "open_ended",
  UNKNOWN: "unknown",
};

const CAREER_TYPE = {
  ENTRY: "entry",
  EXPERIENCED: "experienced",
  ANY: "any",
  UNKNOWN: "unknown",
};

const MAX_DEADLINE_TEXT_LENGTH = 80;
const DATE_PATTERN = /(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})\s*(?:일)?/g;
const OPEN_ENDED_PATTERN = /(채용시까지|상시\s*채용|상시채용|수시\s*채용|수시채용)/i;

function parseDeadline(rawText, today = new Date()) {
  const text = String(rawText || "");
  const deadlineText = extractDeadlineText(text);

  if (OPEN_ENDED_PATTERN.test(text)) {
    return {
      deadlineText: deadlineText || "채용시까지",
      deadlineDate: null,
      deadlineKind: DEADLINE_KIND.OPEN_ENDED,
    };
  }

  const deadlineDate = extractLastDate(text);

  if (!deadlineDate) {
    return {
      deadlineText,
      deadlineDate: null,
      deadlineKind: DEADLINE_KIND.UNKNOWN,
    };
  }

  return {
    deadlineText: deadlineText || deadlineDate,
    deadlineDate,
    deadlineKind: DEADLINE_KIND.DATE,
    isExpired: deadlineDate < formatDate(today),
  };
}

function parseCareerType(title, rawText) {
  const text = `${title || ""} ${rawText || ""}`;

  if (/(경력\s*무관|신입\s*\/\s*경력|신입\s*및\s*경력|신입\s*·\s*경력|무관)/i.test(text)) {
    return CAREER_TYPE.ANY;
  }

  if (/(신입|인턴|채용연계형|주니어|Junior)/i.test(text)) {
    return CAREER_TYPE.ENTRY;
  }

  if (/(경력|[1-9]\d?\s*년\s*이상|시니어|Senior|리드|Lead)/i.test(text)) {
    return CAREER_TYPE.EXPERIENCED;
  }

  return CAREER_TYPE.UNKNOWN;
}

function extractDeadlineText(text) {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  const dateText = extractDateDeadlineText(normalizedText);

  if (dateText) {
    return dateText;
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const deadlineLine = lines.find((line) => (
    line.length <= MAX_DEADLINE_TEXT_LENGTH &&
    /(접수|기간|마감|채용시까지|상시\s*채용|상시채용|수시\s*채용|수시채용)/i.test(line)
  ));

  if (deadlineLine) {
    return deadlineLine;
  }

  const openEnded = normalizedText.match(OPEN_ENDED_PATTERN);

  if (openEnded) {
    return openEnded[0].replace(/\s+/g, "");
  }

  return "";
}

function extractLastDate(text) {
  const dates = [];
  DATE_PATTERN.lastIndex = 0;
  let match = DATE_PATTERN.exec(text);

  while (match) {
    dates.push(toDateString(match[1], match[2], match[3]));
    match = DATE_PATTERN.exec(text);
  }

  return dates.length > 0 ? dates.sort().at(-1) : null;
}

function extractDateDeadlineText(text) {
  const matches = [];
  DATE_PATTERN.lastIndex = 0;
  let match = DATE_PATTERN.exec(text);

  while (match) {
    matches.push({
      index: match.index,
      endIndex: DATE_PATTERN.lastIndex,
      date: toDateString(match[1], match[2], match[3]),
    });
    match = DATE_PATTERN.exec(text);
  }

  if (matches.length === 0) {
    return "";
  }

  const deadlineDate = matches.sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const prefix = text.slice(Math.max(0, deadlineDate.index - MAX_DEADLINE_TEXT_LENGTH), deadlineDate.index);
  const markerPattern = /(접수기간|지원기간|접수|기간|마감|~|부터)\s*[:~\-]?\s*/gi;
  let marker = markerPattern.exec(prefix);
  let lastMarker = null;

  while (marker) {
    lastMarker = marker;
    marker = markerPattern.exec(prefix);
  }

  const startIndex = lastMarker
    ? deadlineDate.index - (prefix.length - lastMarker.index)
    : Math.max(0, deadlineDate.index - 20);
  const suffix = text.slice(deadlineDate.endIndex, deadlineDate.endIndex + 12).match(/^\s*(까지|마감|접수|일)?/);
  const endIndex = deadlineDate.endIndex + (suffix ? suffix[0].length : 0);

  return text.slice(startIndex, endIndex).trim();
}

function toDateString(year, month, day) {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function formatDate(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

module.exports = {
  CAREER_TYPE,
  DEADLINE_KIND,
  formatDate,
  parseCareerType,
  parseDeadline,
};
