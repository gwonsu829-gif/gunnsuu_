import { NextResponse } from "next/server";

import { recordAudit, whoFrom } from "@/lib/audit";
import { authEnabled } from "@/lib/auth";
import { googleStatus, redirectUri } from "@/lib/google";
import { readGeminiKey, geminiModel } from "@/lib/gemini";
import { normalizeSettings } from "@/lib/settings";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const store = getStore();
  const [settings, google] = await Promise.all([store.getSettings(), googleStatus()]);
  return NextResponse.json({
    settings,
    google: { ...google, redirectUri: redirectUri(request.url) },
    gemini: { configured: Boolean(readGeminiKey()), model: geminiModel() },
    passcode: authEnabled(),
    storage: store.kind,
  });
}

export async function PUT(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "본문을 읽을 수 없습니다." }, { status: 400 });
  }
  const settings = normalizeSettings(raw);
  await getStore().setSettings(settings);
  await recordAudit({
    who: whoFrom(request),
    action: "설정변경",
    summary: `설정 저장 (팀 ${settings.team.length}명 · 규칙 ${settings.keywordRules.length}개)`,
  });
  return NextResponse.json({ settings });
}
