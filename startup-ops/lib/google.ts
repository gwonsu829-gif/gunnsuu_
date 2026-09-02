import { getStore } from "./store";

/**
 * 구글 계정 연결 (Gmail + 캘린더).
 *
 * 계정은 하나다 — 대표님 계정을 연결하고 세 사람이 그 메일함·캘린더를 함께 본다.
 * 사람마다 OAuth를 태우면 "누구 캘린더에 올릴까"부터 다시 정해야 하고,
 * 3인 팀에서 그 복잡도는 얻는 것보다 잃는 게 많다.
 *
 * 토큰은 저장소에 한 벌만 둔다. 환경변수에 refresh token을 넣는 방식은
 * 연결을 끊거나 계정을 바꿀 때마다 재배포해야 해서 뺐다.
 */

export const GOOGLE_TOKENS_KEY = "google:tokens";

export const GOOGLE_SCOPES = [
  // 라벨을 만들고 붙이려면 modify가 필요하다. readonly로는 라벨링이 안 된다.
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

export interface GoogleTokens {
  refreshToken: string;
  accessToken: string;
  /** epoch ms */
  expiresAt: number;
  email: string;
  scope: string;
  connectedAt: string;
}

export class GoogleError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

function clean(v: string | undefined): string {
  return (v ?? "").trim().replace(/^["']|["']$/g, "");
}

export function googleClientConfig(): { clientId: string; clientSecret: string } | null {
  const clientId = clean(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = clean(process.env.GOOGLE_CLIENT_SECRET);
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * 콜백 주소. 환경변수가 있으면 그것을, 없으면 요청이 들어온 도메인으로 만든다.
 * 구글 콘솔에 등록한 값과 글자 하나까지 같아야 하므로 화면(설정)에 그대로 보여준다.
 */
export function redirectUri(requestUrl: string): string {
  const fixed = clean(process.env.GOOGLE_REDIRECT_URI);
  if (fixed) return fixed;
  const u = new URL(requestUrl);
  // Vercel 뒤에서는 프로토콜이 http로 보일 수 있다. 배포 환경이면 https로 고정한다.
  const proto = process.env.VERCEL ? "https" : u.protocol.replace(":", "");
  return `${proto}://${u.host}/api/google/callback`;
}

export function buildAuthUrl(requestUrl: string, state: string): string {
  const cfg = googleClientConfig();
  if (!cfg) throw new GoogleError("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET이 없습니다.");
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri(requestUrl),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    // refresh token은 offline + consent 일 때만 내려온다. 빠뜨리면 한 시간 뒤 끊긴다.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(form: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !body.access_token) {
    throw new GoogleError(
      `구글 토큰 오류 ${res.status} — ${body.error_description ?? body.error ?? "응답 없음"}`,
      res.status,
    );
  }
  return body;
}

/** 콜백에서 code를 토큰으로 바꾸고 저장한다. */
export async function exchangeCode(code: string, requestUrl: string): Promise<GoogleTokens> {
  const cfg = googleClientConfig();
  if (!cfg) throw new GoogleError("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET이 없습니다.");
  const body = await tokenRequest({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: redirectUri(requestUrl),
    grant_type: "authorization_code",
  });
  if (!body.refresh_token) {
    // 이미 동의한 적이 있으면 구글이 refresh token을 다시 안 준다. prompt=consent로 막아두긴 했다.
    throw new GoogleError(
      "구글이 refresh token을 주지 않았습니다. 구글 계정 → 보안 → 서드파티 액세스에서 앱을 지우고 다시 연결하세요.",
    );
  }

  const email = await fetchEmail(body.access_token as string);
  const tokens: GoogleTokens = {
    refreshToken: body.refresh_token,
    accessToken: body.access_token as string,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    email,
    scope: body.scope ?? "",
    connectedAt: new Date().toISOString(),
  };
  await getStore().setJSON(GOOGLE_TOKENS_KEY, tokens);
  return tokens;
}

async function fetchEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return "";
  const body = (await res.json().catch(() => ({}))) as { email?: string };
  return body.email ?? "";
}

export async function getConnection(): Promise<GoogleTokens | null> {
  return getStore().getJSON<GoogleTokens>(GOOGLE_TOKENS_KEY);
}

export async function disconnect(): Promise<void> {
  const tokens = await getConnection();
  await getStore().del(GOOGLE_TOKENS_KEY);
  if (tokens?.refreshToken) {
    // 구글 쪽 동의도 거둔다. 실패해도 우리 쪽 토큰은 이미 지웠으니 무시.
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.refreshToken)}`,
      { method: "POST", cache: "no-store" },
    ).catch(() => undefined);
  }
}

/** 만료 1분 전이면 미리 갱신한다. 요청 도중에 끊기는 것보다 낫다. */
async function accessToken(): Promise<string> {
  const tokens = await getConnection();
  if (!tokens) throw new GoogleError("구글 계정이 연결되어 있지 않습니다.", 401);
  if (tokens.expiresAt - Date.now() > 60_000) return tokens.accessToken;

  const cfg = googleClientConfig();
  if (!cfg) throw new GoogleError("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET이 없습니다.");
  const body = await tokenRequest({
    refresh_token: tokens.refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
  });
  const next: GoogleTokens = {
    ...tokens,
    accessToken: body.access_token as string,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  await getStore().setJSON(GOOGLE_TOKENS_KEY, next);
  return next.accessToken;
}

/**
 * 구글 API 호출 한 벌. 토큰을 붙이고, 오류를 읽을 수 있는 문장으로 바꾼다.
 * 204(내용 없음)는 null을 돌려준다.
 */
export async function googleFetch<T>(
  url: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const token = await accessToken();
  const u = new URL(url);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined && v !== "") u.searchParams.set(k, v);
  }
  const res = await fetch(u.toString(), {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (res.status === 204) return null as T;
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: number };
  };
  if (!res.ok) {
    throw new GoogleError(
      `구글 API ${res.status} — ${body.error?.message ?? res.statusText}`,
      res.status,
    );
  }
  return body as T;
}

/** 화면에 보여줄 연결 상태. 비밀 값은 내보내지 않는다. */
export async function googleStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  email?: string;
  connectedAt?: string;
}> {
  const configured = googleClientConfig() !== null;
  const tokens = await getConnection().catch(() => null);
  return {
    configured,
    connected: Boolean(tokens?.refreshToken),
    email: tokens?.email || undefined,
    connectedAt: tokens?.connectedAt,
  };
}
