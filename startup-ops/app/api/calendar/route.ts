import { NextResponse } from "next/server";

import { listBusy } from "@/lib/calendar";
import { GoogleError } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 주 격자에 흐리게 깔 다른 일정. ?from=ISO&to=ISO */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    return NextResponse.json({ error: "from, to가 필요합니다." }, { status: 400 });
  }
  try {
    const events = await listBusy(new Date(from).toISOString(), new Date(to).toISOString());
    return NextResponse.json({ events });
  } catch (e) {
    const message = e instanceof GoogleError ? e.message : "캘린더를 읽지 못했습니다.";
    return NextResponse.json({ events: [], error: message });
  }
}
