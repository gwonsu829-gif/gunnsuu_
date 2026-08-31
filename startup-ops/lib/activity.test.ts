import assert from "node:assert/strict";

import { avgHoursToAssign, buildActivity, clockKST, isOnDate } from "./activity";
import { Task } from "./types";

/** 시험용 할일. 나머지 필드는 이 시험이 보지 않는다. */
function task(over: Partial<Task> & { id: string }): Task {
  return {
    title: "제목",
    role: "CS",
    priority: "중간",
    dueDate: "2026-08-30",
    assignee: "미지정",
    source: "근거 문장",
    status: "미처리",
    origin: "server",
    channel: "email",
    rawText: "원문",
    sourceLabel: "출처",
    ...over,
  };
}

const 오늘 = "2026-08-26";

function demo() {
  // KST 경계: UTC 15:00은 이미 다음 날 0시(KST)다.
  assert.equal(isOnDate("2026-08-26T14:59:00Z", "2026-08-26"), true);
  assert.equal(isOnDate("2026-08-26T15:00:00Z", "2026-08-26"), false);
  assert.equal(isOnDate("2026-08-26T15:00:00Z", "2026-08-27"), true);
  assert.equal(clockKST("2026-08-26T05:51:00Z"), "14:51");

  // 같은 원문에서 나온 두 건은 사건 하나로 묶인다.
  const 나뉜메일 = buildActivity(
    [
      task({ id: "a", rawText: "같은 메일", createdAt: "2026-08-26T05:51:00Z" }),
      task({ id: "b", rawText: "같은 메일", createdAt: "2026-08-26T05:51:30Z" }),
    ],
    오늘,
  ).filter((x) => x.kind === "수집");
  assert.equal(나뉜메일.length, 1);
  assert.equal(나뉜메일[0].title, "메일이 할일 2건으로 나뉘었습니다");
  assert.deepEqual(나뉜메일[0].taskIds.slice().sort(), ["a", "b"]);
  // 묶음의 시각은 가장 이른 것.
  assert.equal(나뉜메일[0].at, "2026-08-26T05:51:00Z");

  // 원문이 다르면 따로 센다.
  const 따로 = buildActivity(
    [
      task({ id: "a", rawText: "메일 1", createdAt: "2026-08-26T05:00:00Z" }),
      task({ id: "b", rawText: "메일 2", createdAt: "2026-08-26T06:00:00Z" }),
    ],
    오늘,
  ).filter((x) => x.kind === "수집");
  assert.equal(따로.length, 2);

  // 담당 미지정은 담당 사건을 만들지 않는다.
  const 미지정 = buildActivity(
    [
      task({
        id: "a",
        createdAt: "2026-08-26T05:00:00Z",
        assignee: "미지정",
        stageAt: { assigned: "2026-08-26T06:00:00Z" },
      }),
    ],
    오늘,
  );
  assert.equal(미지정.filter((x) => x.kind === "담당").length, 0);

  // 담당이 정해지면 사건이 생긴다.
  const 지정됨 = buildActivity(
    [
      task({
        id: "a",
        createdAt: "2026-08-26T05:00:00Z",
        assignee: "김도현",
        stageAt: { assigned: "2026-08-26T06:00:00Z" },
      }),
    ],
    오늘,
  );
  assert.equal(지정됨.filter((x) => x.kind === "담당").length, 1);

  // 시간 역순.
  assert.ok(지정됨[0].at >= 지정됨[지정됨.length - 1].at);

  // 기한 지남: 마감 다음 날 0시(KST)에 일어난 것으로 잡힌다.
  const 지남 = buildActivity(
    [task({ id: "a", dueDate: "2026-08-24", createdAt: "2026-08-20T00:00:00Z" })],
    "2026-08-25",
  ).filter((x) => x.kind === "기한지남");
  assert.equal(지남.length, 1);
  assert.equal(지남[0].title.includes("1일 지났습니다"), true);

  // 완료된 일은 기한이 지나도 사건을 만들지 않는다.
  const 완료됨 = buildActivity(
    [
      task({
        id: "a",
        dueDate: "2026-08-24",
        status: "완료",
        createdAt: "2026-08-20T00:00:00Z",
      }),
    ],
    "2026-08-25",
  );
  assert.equal(완료됨.filter((x) => x.kind === "기한지남").length, 0);

  // 다른 날 사건은 걸러진다.
  const 어제것 = buildActivity(
    [task({ id: "a", createdAt: "2026-08-25T05:00:00Z" })],
    오늘,
  );
  assert.equal(어제것.length, 0);

  // 평균 배정 시간: 표본이 없으면 null (0이 아니다).
  assert.equal(avgHoursToAssign([task({ id: "a" })]), null);
  assert.equal(
    avgHoursToAssign([
      task({
        id: "a",
        createdAt: "2026-08-26T00:00:00Z",
        stageAt: { assigned: "2026-08-26T04:00:00Z" },
      }),
      task({
        id: "b",
        createdAt: "2026-08-26T00:00:00Z",
        stageAt: { assigned: "2026-08-26T08:00:00Z" },
      }),
    ]),
    6,
  );
  // 순서가 뒤집힌 기록은 표본에서 빠지고, 남는 표본이 없으면 null.
  assert.equal(
    avgHoursToAssign([
      task({
        id: "a",
        createdAt: "2026-08-26T08:00:00Z",
        stageAt: { assigned: "2026-08-26T00:00:00Z" },
      }),
    ]),
    null,
  );

  console.log("activity 점검 통과");
}

demo();
