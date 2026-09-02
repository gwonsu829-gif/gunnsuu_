import { NextResponse } from "next/server";

import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "방금 누가 뭘 바꿨나". 최근 것이 먼저. */
export async function GET(request: Request) {
  const limit = Math.min(Number(new URL(request.url).searchParams.get("limit") ?? 60) || 60, 200);
  return NextResponse.json({ entries: await getStore().listAudit(limit) });
}
