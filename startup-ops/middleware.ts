import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { AUTH_COOKIE, authEnabled, isValidCookie } from "@/lib/auth";

/**
 * 접근코드 문. 화면과 화면이 부르는 API를 막는다.
 *
 * 열어 두는 길:
 *  - /login, /api/login          코드를 넣는 곳
 *  - /api/ingest/*, /api/digest  Apps Script·크론이 오는 곳. 각자 INGEST_SECRET/CRON_SECRET으로 잠겨 있다
 *  - /api/mail/sync, /api/calendar/sync  크론 경로. 헤더로 잠겨 있고, 화면에서 부를 땐 쿠키가 있다
 *  - /api/google/callback         구글이 되돌아오는 곳. 쿠키를 들고 오지 않는다
 *  - /api/health                  진단. 비밀 값을 돌려주지 않는다
 */
const OPEN_PREFIXES = [
  "/login",
  "/api/login",
  "/api/ingest/",
  "/api/digest",
  "/api/google/callback",
  "/api/health",
];

/** 크론이 부를 수 있는 경로. 쿠키가 없어도 비밀 헤더가 맞으면 route 쪽에서 통과시킨다. */
const CRON_PREFIXES = ["/api/mail/sync", "/api/calendar/sync"];

export async function middleware(request: NextRequest) {
  if (!authEnabled()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (OPEN_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const ok = await isValidCookie(request.cookies.get(AUTH_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (CRON_PREFIXES.some((p) => pathname.startsWith(p))) {
    // 쿠키는 없지만 크론일 수 있다. route가 헤더를 검사하도록 통과시킨다.
    const presented =
      request.headers.get("authorization") ?? request.headers.get("x-ingest-secret") ?? "";
    if (presented) return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "접근코드가 필요합니다." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
