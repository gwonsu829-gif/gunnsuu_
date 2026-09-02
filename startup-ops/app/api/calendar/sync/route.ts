import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidCookie } from "@/lib/auth";
import { pullChanges } from "@/lib/calendar";
import { checkCronAuth } from "@/lib/webhook-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function cookie(request: Request, name: string): string | undefined {
  const m = (request.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? m[1] : undefined;
}

/** 캘린더에서 옮기거나 지운 것을 대시보드로 되돌린다. 화면과 크론 둘 다 부른다. */
async function run(request: Request) {
  const fromScreen = await isValidCookie(cookie(request, AUTH_COOKIE));
  if (!fromScreen) {
    const auth = checkCronAuth(request);
    if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  return NextResponse.json(await pullChanges());
}

export const GET = run;
export const POST = run;
