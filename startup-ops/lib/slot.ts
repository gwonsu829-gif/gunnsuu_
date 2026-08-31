import { Slot } from "./types";

/** 한 번에 잡을 수 있는 최대 길이. 이보다 길면 일정이 아니라 실수다. */
export const MAX_SLOT_HOURS = 12;
/** 지금에서 이만큼 벗어난 시각은 오타나 조작으로 본다. */
export const MAX_SLOT_DAYS_AWAY = 365;

/**
 * 화면에서 온 시간을 검사한다. 통과 못 하면 null.
 *
 * 되돌려주는 값은 받은 문자열이 아니라 파싱해서 다시 만든 ISO다.
 * "2026-08-26T14:00+09:00"처럼 표기만 다른 같은 시각이 저장소에
 * 제각각 들어가면 나중에 문자열 비교가 조용히 어긋난다.
 *
 * 라우트 파일이 아니라 여기 두는 이유: Next.js는 route.ts에서
 * HTTP 메서드 말고 다른 걸 export하면 빌드를 막아, 거기 두면 테스트할 수 없다.
 */
export function readSlot(raw: unknown, now = Date.now()): Slot | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { start, end } = raw as { start?: unknown; end?: unknown };
  if (typeof start !== "string" || typeof end !== "string") return null;

  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;

  const 길이 = e.getTime() - s.getTime();
  if (길이 <= 0 || 길이 > MAX_SLOT_HOURS * 3600_000) return null;

  const 떨어짐 = Math.abs(s.getTime() - now);
  if (떨어짐 > MAX_SLOT_DAYS_AWAY * 86400_000) return null;

  return { start: s.toISOString(), end: e.toISOString() };
}
