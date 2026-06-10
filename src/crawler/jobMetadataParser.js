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

function parseDeadline(rawText, today = new Date()) {
  const text = String(rawText || "");
  const deadlineText = extractDeadlineText(text);

  if (/(채용시까지|상시채용|상시 채용|수시채용|수시 채용)/i.test(text)) {
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
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const deadlineLine = lines.find((line) => /(접수|기간|마감|채용시까지|상시채용)/i.test(line));

  return deadlineLine || "";
}

function extractLastDate(text) {
  const dates = [];
  const dotPattern = /(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})\s*(?:일)?/g;
  let match = dotPattern.exec(text);

  while (match) {
    dates.push(toDateString(match[1], match[2], match[3]));
    match = dotPattern.exec(text);
  }

  return dates.length > 0 ? dates.sort().at(-1) : null;
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
