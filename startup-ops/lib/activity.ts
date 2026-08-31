import { addDays, daysUntil } from "./dates";
import { UNASSIGNED } from "./team";
import { Task } from "./types";

/**
 * "오늘 일어난 일" 타임라인.
 *
 * 사건을 따로 적립하지 않고 이미 있는 기록에서 되읽는다.
 * 수집 시각은 createdAt, 담당·진행·완료는 stageAt에 서버가 이미 찍고 있어서
 * 이벤트 로그를 새로 두면 같은 사실을 두 군데 적게 되고, 두 곳이 어긋나는 순간
 * 어느 쪽이 진실인지 판단할 근거가 사라진다.
 *
 * 그래서 없는 사건은 만들지 않는다. 기록이 없는 전환은 타임라인에도 없다.
 */
export type ActivityKind = "수집" | "담당" | "진행" | "완료" | "기한지남";

export interface Activity {
  /** 같은 사건이 두 번 그려지지 않게 하는 키 */
  id: string;
  /** ISO 8601 (UTC) */
  at: string;
  kind: ActivityKind;
  /** 한 줄 요약 */
  title: string;
  /** 근거가 되는 덧말 (없으면 비운다) */
  detail?: string;
  /** 이 사건에 얽힌 할일 */
  taskIds: string[];
}

const CHANNEL_LABEL: Record<Task["channel"], string> = {
  email: "메일",
  discord: "디스코드",
  manual: "붙여넣기",
};

/**
 * 마감일이 지나 "지남"이 된 순간.
 * 마감일 당일 자정까지는 아직 안 지난 것이므로 다음 날 0시(KST)로 잡는다.
 */
function overdueMoment(dueDate: string): string {
  return `${addDays(dueDate, 1)}T00:00:00+09:00`;
}

/** KST 기준으로 그 ISO 시각이 date(YYYY-MM-DD)에 속하는가 */
export function isOnDate(iso: string, date: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d) === date
  );
}

/** "15:04" (KST) */
export function clockKST(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function clip(s: string, n: number): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/**
 * 할일들에서 사건을 되읽어 시간 역순으로 돌려준다.
 * date를 주면 그 날(KST)에 일어난 것만.
 */
export function buildActivity(tasks: Task[], date?: string): Activity[] {
  const out: Activity[] = [];

  /*
   * 수집은 건별이 아니라 원문별로 묶는다.
   * 메일 하나가 할일 두 건으로 나뉜 것은 사건 두 개가 아니라 하나이고,
   * "몇 건으로 나뉘었나"가 이 화면에서 보고 싶은 값이다.
   */
  const 원문별 = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.createdAt) continue;
    // 원문이 비어 있으면 묶을 근거가 없으므로 건별로 둔다.
    const key = t.rawText?.trim() ? `${t.channel} ${t.rawText}` : `단독 ${t.id}`;
    const cur = 원문별.get(key);
    if (cur) cur.push(t);
    else 원문별.set(key, [t]);
  }

  // Map을 직접 순회하지 않는다 — 이 프로젝트 타깃에서는 downlevelIteration이 필요하다.
  for (const [key, group] of Array.from(원문별.entries())) {
    // 한 묶음의 시각은 가장 먼저 들어온 것으로 본다.
    const at = group
      .map((t) => t.createdAt as string)
      .sort((a, b) => a.localeCompare(b))[0];
    const head = group[0];
    const 출처 = `${CHANNEL_LABEL[head.channel]} · ${head.sourceLabel || "출처 없음"}`;
    out.push({
      id: `수집:${key}`,
      at,
      kind: "수집",
      title:
        group.length > 1
          ? `${CHANNEL_LABEL[head.channel]}이 할일 ${group.length}건으로 나뉘었습니다`
          : `${출처}에서 할일 1건`,
      detail: head.source ? `"${clip(head.source, 46)}"` : undefined,
      taskIds: group.map((t) => t.id),
    });
  }

  for (const t of tasks) {
    if (t.stageAt?.assigned && t.assignee && t.assignee !== UNASSIGNED) {
      out.push({
        id: `담당:${t.id}`,
        at: t.stageAt.assigned,
        kind: "담당",
        title: `${clip(t.title, 26)} 담당이 ${t.assignee}으로 정해졌습니다`,
        taskIds: [t.id],
      });
    }
    if (t.stageAt?.started) {
      out.push({
        id: `진행:${t.id}`,
        at: t.stageAt.started,
        kind: "진행",
        title: `${clip(t.title, 26)} 진행이 시작되었습니다`,
        taskIds: [t.id],
      });
    }
    if (t.stageAt?.done) {
      out.push({
        id: `완료:${t.id}`,
        at: t.stageAt.done,
        kind: "완료",
        title: `${clip(t.title, 26)}이 완료되었습니다`,
        taskIds: [t.id],
      });
    }

    /*
     * 기한 지남은 사람이 한 일이 아니라 시각이 지나며 저절로 생긴 사건이라
     * 기록이 남지 않는다. 마감일 다음 날 0시로 시각을 계산해 채운다 —
     * 지어낸 값이 아니라 마감일에서 그대로 결정되는 값이다.
     */
    const 남은날 = daysUntil(t.dueDate, date);
    if (t.status !== "완료" && 남은날 !== null && 남은날 < 0) {
      out.push({
        id: `기한지남:${t.id}`,
        at: overdueMoment(t.dueDate),
        kind: "기한지남",
        title: `${clip(t.title, 26)} 기한이 ${-남은날}일 지났습니다`,
        taskIds: [t.id],
      });
    }
  }

  const 정렬됨 = out.sort((a, b) => b.at.localeCompare(a.at));
  return date ? 정렬됨.filter((a) => isOnDate(a.at, date)) : 정렬됨;
}

/**
 * 담당이 정해지기까지 걸린 시간의 평균(시간 단위).
 * 표본이 없으면 null — 0으로 두면 "즉시 배정된다"는 거짓말이 된다.
 */
export function avgHoursToAssign(tasks: Task[]): number | null {
  const 걸린시간: number[] = [];
  for (const t of tasks) {
    if (!t.createdAt || !t.stageAt?.assigned) continue;
    const 차 =
      new Date(t.stageAt.assigned).getTime() - new Date(t.createdAt).getTime();
    // 순서가 뒤집힌 기록은 표본에서 뺀다.
    if (Number.isFinite(차) && 차 >= 0) 걸린시간.push(차 / 3600_000);
  }
  if (!걸린시간.length) return null;
  return 걸린시간.reduce((a, b) => a + b, 0) / 걸린시간.length;
}
