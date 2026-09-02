import { todayISO } from "./dates";
import { getStore } from "./store";

/**
 * AI 호출을 센다.
 *
 * 이 파일이 있는 이유는 요금 걱정 때문이다. Gemini 무료 등급에는 하루 호출 한도가 있고,
 * 유료로 가더라도 "얼마나 나올지 모르는 것"이 가장 불안하다. 상한을 코드로 걸어 두면
 * 초과가 구조적으로 불가능해지고, 그때부터는 걱정하지 않고 켜 둘 수 있다.
 *
 * 상한에 닿으면 수집을 멈추되 원문은 손대지 않는다 — 커서를 옮기지 않고 처리 표시도 거둔다.
 * 그래서 다음 날 그대로 이어서 읽는다. 사라지는 할일은 없고, 미뤄질 뿐이다.
 */

const KEY = "usage:v1";
/** 이만큼의 날짜만 남긴다. 지난 사용량은 "이번 주에 얼마나 썼나"까지만 쓸모가 있다. */
const KEEP_DAYS = 14;

/** 어느 경로가 부른 호출인지. 상한은 collect에만 건다. */
export type CallKind = "collect" | "pin" | "manual";

export interface DayUsage {
  calls: number;
  collect: number;
  pin: number;
  manual: number;
}

export type UsageLog = Record<string, DayUsage>;

const empty = (): DayUsage => ({ calls: 0, collect: 0, pin: 0, manual: 0 });

async function readLog(): Promise<UsageLog> {
  return (await getStore().getJSON<UsageLog>(KEY)) ?? {};
}

export async function readUsage(day: string = todayISO()): Promise<DayUsage> {
  return (await readLog())[day] ?? empty();
}

/** 최근 며칠치. 화면에서 "이번 주 얼마나 썼나"를 보여줄 때 쓴다. */
export async function readRecent(days = 7): Promise<{ day: string; usage: DayUsage }[]> {
  const log = await readLog();
  return Object.keys(log)
    .sort()
    .slice(-days)
    .map((day) => ({ day, usage: log[day] }));
}

/**
 * 호출 한 번을 기록한다.
 *
 * 실패한 호출도 센다. 요금은 성공 여부가 아니라 요청 수로 매겨지고,
 * 무료 등급 한도도 요청 수로 깎인다. 성공만 세면 화면 숫자가 실제보다 작아 안심시킨다.
 */
export async function recordCall(kind: CallKind): Promise<void> {
  try {
    const store = getStore();
    const log = await readLog();
    const day = todayISO();
    const cur = log[day] ?? empty();
    log[day] = { ...cur, calls: cur.calls + 1, [kind]: cur[kind] + 1 };

    const days = Object.keys(log).sort();
    for (const d of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) delete log[d];

    await store.setJSON(KEY, log);
  } catch (e) {
    // 계량이 안 돼도 본 작업을 막지 않는다. 숫자보다 할일이 중요하다.
    console.error("[usage] 기록 실패:", e instanceof Error ? e.message : e);
  }
}

export interface QuotaState {
  limit: number;
  used: number;
  left: number;
  /** 상한에 닿아 자동 수집이 멈춘 상태 */
  exhausted: boolean;
}

/**
 * 자동 수집이 오늘 더 부를 수 있는지.
 * limit이 0이면 상한 없음 — 유료 등급을 쓰기로 하고 걱정을 접은 경우다.
 */
export async function checkQuota(limit: number): Promise<QuotaState> {
  const used = (await readUsage()).calls;
  if (limit <= 0) return { limit: 0, used, left: Number.POSITIVE_INFINITY, exhausted: false };
  const left = Math.max(0, limit - used);
  return { limit, used, left, exhausted: left <= 0 };
}
