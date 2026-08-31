import assert from "node:assert/strict";

import { readSlot } from "./slot";

/**
 * 신뢰 경계 검사라 확인을 남긴다.
 * now를 고정한다 — 실제 시각을 쓰면 "1년 밖" 판정이 날짜에 따라 흔들려
 * 어느 날 갑자기 빨개지는 시험이 된다.
 */
const 지금 = Date.parse("2026-08-26T00:00:00.000Z");

function demo() {
  // 정상. 표기가 달라도 같은 시각이면 같은 ISO로 정규화된다.
  assert.deepEqual(
    readSlot({ start: "2026-08-26T05:00:00Z", end: "2026-08-26T07:00:00Z" }, 지금),
    { start: "2026-08-26T05:00:00.000Z", end: "2026-08-26T07:00:00.000Z" },
  );
  assert.deepEqual(
    readSlot({ start: "2026-08-26T14:00:00+09:00", end: "2026-08-26T16:00:00+09:00" }, 지금),
    { start: "2026-08-26T05:00:00.000Z", end: "2026-08-26T07:00:00.000Z" },
  );

  // 끝이 시작보다 앞이거나 같으면 거부.
  assert.equal(readSlot({ start: "2026-08-26T07:00:00Z", end: "2026-08-26T05:00:00Z" }, 지금), null);
  assert.equal(readSlot({ start: "2026-08-26T05:00:00Z", end: "2026-08-26T05:00:00Z" }, 지금), null);

  // 12시간 경계: 딱 12시간은 통과, 1분만 넘어도 거부.
  assert.ok(readSlot({ start: "2026-08-26T00:00:00Z", end: "2026-08-26T12:00:00Z" }, 지금));
  assert.equal(readSlot({ start: "2026-08-26T00:00:00Z", end: "2026-08-26T12:01:00Z" }, 지금), null);

  // 1년 밖은 거부.
  assert.equal(readSlot({ start: "2028-01-01T00:00:00Z", end: "2028-01-01T01:00:00Z" }, 지금), null);

  // 형식이 아닌 것들.
  for (const 나쁜값 of [
    null,
    undefined,
    "2026-08-26",
    42,
    {},
    { start: "2026-08-26T05:00:00Z" },
    { start: "내일", end: "모레" },
    { start: 1, end: 2 },
  ]) {
    assert.equal(readSlot(나쁜값, 지금), null, `거부했어야 함: ${JSON.stringify(나쁜값)}`);
  }

  console.log("readSlot 점검 통과");
}

demo();
