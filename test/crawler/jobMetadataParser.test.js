const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CAREER_TYPE,
  DEADLINE_KIND,
  parseCareerType,
  parseDeadline,
} = require("../../src/crawler/jobMetadataParser");

const today = new Date("2026-06-10T00:00:00+09:00");

test("parseDeadline classifies date deadlines", () => {
  assert.deepEqual(parseDeadline("접수기간: 2026.07.31까지", today), {
    deadlineText: "접수기간: 2026.07.31까지",
    deadlineDate: "2026-07-31",
    deadlineKind: DEADLINE_KIND.DATE,
    isExpired: false,
  });

  assert.deepEqual(parseDeadline("지원기간 ~ 2026년 7월 31일", today), {
    deadlineText: "지원기간 ~ 2026년 7월 31일",
    deadlineDate: "2026-07-31",
    deadlineKind: DEADLINE_KIND.DATE,
    isExpired: false,
  });
});

test("parseDeadline classifies open ended and unknown deadlines", () => {
  assert.deepEqual(parseDeadline("채용시까지 접수", today), {
    deadlineText: "채용시까지 접수",
    deadlineDate: null,
    deadlineKind: DEADLINE_KIND.OPEN_ENDED,
  });

  assert.deepEqual(parseDeadline("상시채용", today), {
    deadlineText: "상시채용",
    deadlineDate: null,
    deadlineKind: DEADLINE_KIND.OPEN_ENDED,
  });

  assert.deepEqual(parseDeadline("접수 정보 없음", today), {
    deadlineText: "접수 정보 없음",
    deadlineDate: null,
    deadlineKind: DEADLINE_KIND.UNKNOWN,
  });
});

test("parseDeadline reports expired date deadlines", () => {
  const result = parseDeadline("마감: 2026.01.01까지", today);

  assert.equal(result.deadlineKind, DEADLINE_KIND.DATE);
  assert.equal(result.deadlineDate, "2026-01-01");
  assert.equal(result.isExpired, true);
});

test("parseDeadline does not use full collapsed body as deadline text", () => {
  const body = [
    "함께하시게 될 팀을 소개합니다.",
    "LLM 및 AI 기술을 실제 서비스 가치로 전환하는 데 집중합니다.",
    "지원 전 확인해주세요.",
    "본 채용은 수시 채용으로 적합자 발생시 자동 종료됩니다.",
    "필요 시 사전에 안내된 채용절차 이외의 과제 전형이 진행될 수 있습니다.",
    "지원하러 가기 최신 댓글 모음 보러가기",
  ].join(" ");
  const result = parseDeadline(body, today);

  assert.equal(result.deadlineKind, DEADLINE_KIND.OPEN_ENDED);
  assert.equal(result.deadlineText, "수시채용");
});

test("parseDeadline extracts short date text from collapsed body", () => {
  const result = parseDeadline(
    "공고 설명이 길게 이어집니다. 접수기간: 2026.07.31까지 지원 가능합니다. 이후 직무 설명 본문이 이어집니다.",
    today,
  );

  assert.equal(result.deadlineKind, DEADLINE_KIND.DATE);
  assert.equal(result.deadlineText, "접수기간: 2026.07.31까지");
  assert.equal(result.deadlineDate, "2026-07-31");
});

test("parseCareerType classifies entry experienced any and unknown", () => {
  assert.equal(parseCareerType("백엔드 인턴", ""), CAREER_TYPE.ENTRY);
  assert.equal(parseCareerType("서버 개발자", "3년 이상 경력"), CAREER_TYPE.EXPERIENCED);
  assert.equal(parseCareerType("백엔드 개발자", "경력 무관"), CAREER_TYPE.ANY);
  assert.equal(parseCareerType("서버 개발자", "좋은 동료"), CAREER_TYPE.UNKNOWN);
});
