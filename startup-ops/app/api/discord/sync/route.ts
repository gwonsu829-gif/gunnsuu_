import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidCookie } from "@/lib/auth";
import { collectDiscord } from "@/lib/discord-collect";
import { checkCronAuth } from "@/lib/webhook-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cookie(request: Request, name: string): string | undefined {
  const m = (request.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? m[1] : undefined;
}

/**
 * 메일과 같은 모양으로 맞췄다.
 *   POST /api/discord/sync            화면 자동 (5분 문턱을 지킴)
 *   POST /api/discord/sync?force=1    "지금 수집" 버튼
 *   GET  /api/discord/sync            Vercel 크론
 */
async function run(request: Request) {
  const fromScreen = await isValidCookie(cookie(request, AUTH_COOKIE));
  if (!fromScreen) {
    const auth = checkCronAuth(request);
    if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const force = new URL(request.url).searchParams.get("force") === "1";
  const result = await collectDiscord({ force });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}

export const GET = run;
export const POST = run;
