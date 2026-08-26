import { daysUntil, ddayLabel, weekdayKo } from "./dates";
import { PRIORITY_ORDER } from "./roles";
import { StoredTask } from "./store";
import { UNASSIGNED } from "./team";

/** 디스코드 메시지 한 통의 상한. 넘으면 잘려서 전송이 실패한다. */
const MAX_CHARS = 1900;

interface Group {
  label: string;
  items: StoredTask[];
}

/**
 * 아침에 밀어줄 요약.
 *
 * 대시보드는 열어야 보이지만 누락은 "안 열어서" 생긴다.
 * 그래서 처리 관문은 화면이 아니라 알림이 맡아야 한다.
 *
 * 마감이 지났거나 임박한 것만 넣는다. 먼 것까지 매일 나열하면
 * 읽지 않게 되고, 그러면 알림이 있으나 마나가 된다.
 */
export function buildDigest(
  tasks: StoredTask[],
  today: string,
  appUrl: string,
): { text: string; count: number } {
  const open = tasks.filter((t) => t.status !== "완료");

  const groups: Group[] = [
    { label: "기한 지남", items: pick(open, today, (d) => d !== null && d < 0) },
    { label: "오늘 마감", items: pick(open, today, (d) => d === 0) },
    { label: "내일", items: pick(open, today, (d) => d === 1) },
    { label: "이번 주", items: pick(open, today, (d) => d !== null && d >= 2 && d <= 6) },
    /*
     * 기한이 안 잡힌 할일은 마감이 없으니 어떤 D-day 묶음에도 걸리지 않는다.
     * 그대로 두면 알림에 한 번도 안 나오고, 화면을 안 열면 그대로 잊힌다.
     * 누락은 바로 이 자리에서 생기므로 마지막에 따로 세워 둔다.
     */
    { label: "기한 미정", items: pick(open, today, (d) => d === null) },
  ].filter((g) => g.items.length > 0);

  const urgent = groups.reduce((n, g) => n + g.items.length, 0);
  const [, m, d] = today.split("-");
  const head = `**오늘의 할일 · ${Number(m)}월 ${Number(d)}일(${weekdayKo(today)})**`;

  if (urgent === 0) {
    return {
      text: [
        head,
        "",
        "마감이 임박한 할일이 없습니다.",
        "",
        `전체 보기 → ${appUrl}`,
      ].join("\n"),
      count: 0,
    };
  }

  // 본문과 꼬리를 따로 만든다.
  // 한 덩어리로 잘라내면 링크와 집계처럼 항상 남아야 할 줄이 먼저 사라진다.
  const body: string[] = [];
  for (const group of groups) {
    body.push(`**${group.label} · ${group.items.length}건**`);
    for (const t of group.items) {
      body.push(`· ${line(t, today)}`);
    }
    body.push("");
  }

  const unassigned = open.filter((t) => t.assignee === UNASSIGNED).length;
  const summary: string[] = [];
  if (unassigned > 0) summary.push(`담당자 미지정 ${unassigned}건`);
  summary.push(`전체 ${open.length}건`);
  const tail = [summary.join(" · "), `전체 보기 → ${appUrl}`];

  const budget = MAX_CHARS - head.length - tail.join("\n").length - 20;
  return {
    text: [head, "", ...clampBody(body, budget), ...tail].join("\n"),
    count: urgent,
  };
}

/** 예산 안에서 항목을 담고, 빠진 건수를 그 자리에 밝힌다. */
function clampBody(body: string[], budget: number): string[] {
  const kept: string[] = [];
  let used = 0;
  let dropped = 0;

  for (const l of body) {
    if (dropped > 0 || used + l.length + 1 > budget) {
      if (l.startsWith("· ")) dropped += 1;
      continue;
    }
    kept.push(l);
    used += l.length + 1;
  }

  if (dropped > 0) {
    // 마지막 빈 줄 앞에 끼워 넣는다
    while (kept.length && kept[kept.length - 1] === "") kept.pop();
    kept.push(`… 외 ${dropped}건`, "");
  }
  return kept;
}

function pick(
  tasks: StoredTask[],
  today: string,
  test: (d: number | null) => boolean,
): StoredTask[] {
  return tasks
    .filter((t) => test(daysUntil(t.dueDate, today)))
    .sort((a, b) => {
      const da = daysUntil(a.dueDate, today) ?? 0;
      const db = daysUntil(b.dueDate, today) ?? 0;
      if (da !== db) return da - db;
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    });
}

function line(t: StoredTask, today: string): string {
  const d = daysUntil(t.dueDate, today);
  const bits = [d === null ? "미정" : ddayLabel(d), t.role];
  if (t.assignee !== UNASSIGNED) bits.push(t.assignee);
  else bits.push("담당 미지정");
  return `${t.title} — ${bits.join(" · ")}`;
}

/** 상한을 넘으면 뒤를 자르되, 몇 건이 빠졌는지 밝힌다. */
function clamp(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  const lines = text.split("\n");
  const kept: string[] = [];
  let dropped = 0;
  for (const l of lines) {
    if (kept.join("\n").length + l.length > MAX_CHARS - 80) {
      if (l.startsWith("· ")) dropped += 1;
      continue;
    }
    kept.push(l);
  }
  if (dropped > 0) kept.push(`… 외 ${dropped}건`);
  return kept.join("\n");
}
