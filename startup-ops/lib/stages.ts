import { AssigneeSuggestion } from "./suggest";
import { UNASSIGNED } from "./team";
import { Task } from "./types";

/**
 * 할일 한 건이 지나는 길.
 *
 * 대표님이 "쿠팡 배송 조회처럼 단계별로 보였으면 좋겠다"고 하셨다.
 * 배송 조회가 값어치 있는 이유는 물건이 어디 있는지가 아니라
 * "지금 어디서 멈춰 있는지"가 보이기 때문이다. 할일도 같다.
 *
 * 그래서 상태(미처리·진행중·완료) 세 칸이 아니라, 들어온 순간부터
 * 끝날 때까지 실제로 거치는 여섯 칸으로 나눈다. 누락은 앞 세 칸에서
 * 생기고 지연은 넷째 칸에서 생기는데, 상태 세 칸으로는 그게 안 보인다.
 */
export const STAGE_KEYS = [
  "수집",
  "추출",
  "분류",
  "담당",
  "진행",
  "완료",
] as const;

export type StageKey = (typeof STAGE_KEYS)[number];

export interface Stage {
  key: StageKey;
  /** 이 단계를 지났는가 */
  done: boolean;
  /** 지금 멈춰 있는 자리인가 */
  current: boolean;
  /** 그 단계에서 실제로 무슨 일이 있었는지 (모르면 비운다) */
  detail?: string;
  /** ISO 시각. 기록이 있는 칸만 채운다. */
  at?: string;
}

const CHANNEL_LABEL: Record<Task["channel"], string> = {
  email: "메일",
  discord: "디스코드",
  manual: "붙여넣기",
};

/**
 * 지금 담긴 값에서 단계를 읽어낸다.
 *
 * 시각은 기록이 있는 칸만 채운다. 없는 시각을 그럴듯하게 지어내면
 * 화면은 좋아 보여도 "언제 멈췄나"를 물었을 때 거짓말을 하게 된다.
 */
export function buildStages(
  task: Task,
  suggestion?: AssigneeSuggestion,
): Stage[] {
  const 담당됨 = task.assignee !== UNASSIGNED && Boolean(task.assignee?.trim());
  const 진행됨 = task.status === "진행중" || task.status === "완료";
  const 완료됨 = task.status === "완료";

  const raw: Omit<Stage, "current">[] = [
    {
      key: "수집",
      done: true,
      detail: `${CHANNEL_LABEL[task.channel]} · ${task.sourceLabel || "출처 없음"}`,
      at: task.createdAt,
    },
    {
      key: "추출",
      done: true,
      detail: task.source ? `근거 "${clip(task.source, 40)}"` : undefined,
    },
    {
      key: "분류",
      done: true,
      detail: `${task.role} · 우선순위 ${task.priority}`,
    },
    {
      key: "담당",
      done: 담당됨,
      detail: 담당됨
        ? task.assignee
        : suggestion
          ? `추천 ${suggestion.assignee} — ${suggestion.reason}`
          : "추천할 이력이 아직 없습니다",
      at: task.stageAt?.assigned,
    },
    {
      key: "진행",
      done: 진행됨,
      detail: 진행됨 ? undefined : "아직 시작 전",
      at: task.stageAt?.started,
    },
    {
      key: "완료",
      done: 완료됨,
      at: task.stageAt?.done,
    },
  ];

  // 멈춰 있는 자리 = 아직 지나지 않은 첫 칸. 다 지났으면 없다.
  const stuck = raw.findIndex((s) => !s.done);
  return raw.map((s, i) => ({ ...s, current: i === stuck }));
}

/** 각 단계에 몇 건이 머물러 있는지. 쌓이는 자리가 곧 병목이다. */
export function countByStage(
  stages: Stage[][],
): { key: StageKey; 통과: number; 머무름: number }[] {
  return STAGE_KEYS.map((key, i) => ({
    key,
    통과: stages.filter((s) => s[i].done).length,
    머무름: stages.filter((s) => s[i].current).length,
  }));
}

function clip(s: string, n: number): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/** "8/26 14:52" — 기록이 없으면 빈 문자열. */
export function formatStageTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${Number(g("month"))}/${Number(g("day"))} ${g("hour")}:${g("minute")}`;
}
