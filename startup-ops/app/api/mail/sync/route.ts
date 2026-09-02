import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidCookie } from "@/lib/auth";
import { syncMail } from "@/lib/mail";
import { checkCronAuth } from "@/lib/webhook-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cookie(request: Request, name: string): string | undefined {
  const m = (request.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? m[1] : undefined;
}

/**
 * 화면(쿠키)과 크론(비밀 헤더) 둘 다 올 수 있다.
 *   POST /api/mail/sync            화면 자동 (5분 문턱 지킴)
 *   POST /api/mail/sync?force=1    "지금 동기화" 버튼
 *   GET  /api/mail/sync            Vercel 크론
 */
async function run(request: Request) {
  const fromScreen = await isValidCookie(cookie(request, AUTH_COOKIE));
  if (!fromScreen) {
    const auth = checkCronAuth(request);
    if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const force = new URL(request.url).searchParams.get("force") === "1";
  const report = await syncMail({ force });
  return NextResponse.json(report);
}

export const GET = run;
export const POST = run;
