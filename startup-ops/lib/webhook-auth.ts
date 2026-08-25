/**
 * 수집 엔드포인트는 인터넷에 열려 있으므로 공유 비밀로 막는다.
 * INGEST_SECRET이 설정돼 있지 않으면 열어두지 않고 거부한다 —
 * 설정을 깜빡한 배포가 조용히 아무나 쓸 수 있는 상태로 열리는 게 더 나쁘다.
 */
export type AuthResult = { ok: true } | { ok: false; status: number; message: string };

export function checkIngestAuth(request: Request): AuthResult {
  const secret = (process.env.INGEST_SECRET ?? "").trim();
  if (!secret) {
    return {
      ok: false,
      status: 503,
      message: "INGEST_SECRET이 설정되지 않아 수집 엔드포인트가 꺼져 있습니다.",
    };
  }

  const url = new URL(request.url);
  const presented =
    request.headers.get("x-ingest-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    url.searchParams.get("secret") ??
    "";

  if (!timingSafeEqual(presented.trim(), secret)) {
    return { ok: false, status: 401, message: "인증 실패" };
  }
  return { ok: true };
}

/** 길이·내용 비교 시간이 값에 따라 달라지지 않도록. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Vercel Cron은 이 헤더를 붙여 보낸다. 없으면 공유 비밀로도 받아준다. */
export function checkCronAuth(request: Request): AuthResult {
  const cronSecret = (process.env.CRON_SECRET ?? "").trim();
  const auth = request.headers.get("authorization") ?? "";
  if (cronSecret && auth === `Bearer ${cronSecret}`) return { ok: true };
  return checkIngestAuth(request);
}
