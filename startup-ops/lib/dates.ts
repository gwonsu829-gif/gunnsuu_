const SEOUL = "Asia/Seoul";

/** 서버(UTC)와 브라우저 모두에서 같은 "오늘"을 얻기 위해 KST 기준으로 계산한다. */
export function todayISO(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts; // en-CA 로케일은 YYYY-MM-DD 형식
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function weekdayKo(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** "2026-08-28" -> "8/28(금)" */
export function formatDue(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}(${weekdayKo(iso)})`;
}

/** 마감일이 오늘 이전이면 true (미정은 false) */
export function isOverdue(iso: string, today = todayISO()): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && iso < today;
}

export function isDueToday(iso: string, today = todayISO()): boolean {
  return iso === today;
}

/** "2026-09-04" -> "2026년 9월 4일(금)" — 공고문·메일 본문용 */
export function formatKoreanDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y}년 ${Number(m)}월 ${Number(d)}일(${weekdayKo(iso)})`;
}

/** 오늘 포함, 앞으로 가장 가까운 해당 요일 (0=일 … 6=토) */
export function upcomingWeekday(iso: string, weekday: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(iso, (weekday - cur + 7) % 7);
}

/** 다음 주 월요일 */
export function nextWeekMonday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  // 이번 주 월요일까지 되돌린 뒤 7일을 더한다 (일요일은 그 주의 끝으로 본다).
  const backToMonday = cur === 0 ? -6 : 1 - cur;
  return addDays(iso, backToMonday + 7);
}

/**
 * 오늘로부터 며칠 남았는지. 음수면 지났고, 마감 미정이면 null.
 * 앰플랩은 마감을 "D-5" 같은 상대 표기로 관리하므로 화면도 그 단위를 쓴다.
 */
export function daysUntil(iso: string, today = todayISO()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const p = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((p(iso) - p(today)) / 86_400_000);
}

/** "D-Day" / "D-3" / "D+2" (지남) */
export function ddayLabel(days: number): string {
  if (days === 0) return "D-Day";
  return days > 0 ? `D-${days}` : `D+${-days}`;
}
