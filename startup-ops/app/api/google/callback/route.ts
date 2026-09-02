import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { GoogleError, exchangeCode } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function back(request: Request, params: Record<string, string>) {
  const url = new URL("/", request.url);
  url.searchParams.set("tab", "settings");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.set("google_oauth_state", "", { path: "/", maxAge: 0 });
  return res;
}

function readCookie(request: Request, name: string): string {
  const raw = request.headers.get("cookie") ?? "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) return back(request, { google: "denied" });

  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!code || !state || state !== readCookie(request, "google_oauth_state")) {
    return back(request, { google: "state" });
  }

  try {
    const tokens = await exchangeCode(code, request.url);
    await recordAudit({
      who: "설정",
      action: "구글연결",
      summary: `구글 계정 연결 (${tokens.email || "이메일 확인 안 됨"})`,
    });
    return back(request, { google: "connected" });
  } catch (e) {
    const message = e instanceof GoogleError ? e.message : "토큰 교환 실패";
    console.error("[google] 콜백 실패:", message);
    return back(request, { google: "failed", reason: message.slice(0, 200) });
  }
}
