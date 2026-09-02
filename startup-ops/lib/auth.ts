/**
 * 팀 접근코드.
 *
 * 세 사람이 쓰는 내부 도구에 계정 체계를 세우는 건 과하고, 그렇다고 주소만 알면
 * 누구나 고객 메일을 보게 두는 건 안 된다. 그 사이가 "공유 접근코드 + 이름 선택"이다.
 *
 * 쿠키에는 코드가 아니라 코드의 HMAC을 넣는다. 쿠키가 새도 코드 자체는 안 샌다.
 * middleware(edge)와 route(node) 양쪽에서 같은 값을 만들어야 하므로 Web Crypto만 쓴다.
 */

export const AUTH_COOKIE = "ops_auth";
export const USER_COOKIE = "ops_user";
/** 30일. 매일 여는 도구에서 매주 코드를 다시 묻게 하면 결국 코드를 화면 옆에 붙여 둔다. */
export const AUTH_MAX_AGE = 60 * 60 * 24 * 30;

export function readPasscode(): string {
  return (process.env.APP_PASSCODE ?? "").trim();
}

/** APP_PASSCODE가 없으면 잠그지 않는다 (로컬 개발). 배포에서는 설정 화면이 경고한다. */
export function authEnabled(): boolean {
  return readPasscode().length > 0;
}

export async function cookieValueFor(passcode: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(`ops-auth:${passcode}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("startup-ops-session-v1"));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function isValidCookie(value: string | undefined): Promise<boolean> {
  if (!authEnabled()) return true;
  if (!value) return false;
  const expected = await cookieValueFor(readPasscode());
  if (value.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < value.length; i += 1) diff |= value.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
