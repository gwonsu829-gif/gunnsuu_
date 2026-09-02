import { NextResponse } from "next/server";

import { recordAudit, whoFrom } from "@/lib/audit";
import { disconnect } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await disconnect();
  await recordAudit({ who: whoFrom(request), action: "구글해제", summary: "구글 계정 연결 해제" });
  return NextResponse.json({ ok: true });
}
