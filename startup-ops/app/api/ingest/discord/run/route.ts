import { NextResponse } from "next/server";

import { collectDiscord } from "@/lib/discord-collect";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 화면의 "디스코드 지금 수집" 버튼이 부르는 곳.
 *
 * 공유 비밀을 브라우저에 둘 수 없어 이 경로만 서버가 대신 인증한다.
 * 대신 INGEST_SECRET이 설정돼 있을 때만 열리고, 분당 한 번으로 제한한다.
 */
export async function POST() {
  if (!(process.env.INGEST_SECRET ?? "").trim()) {
    return NextResponse.json(
      { error: "INGEST_SECRET이 설정되지 않아 수집이 꺼져 있습니다." },
      { status: 503 },
    );
  }

  const minute = new Date().toISOString().slice(0, 16);
  const fresh = await getStore().markIfUnseen(`discord-run:${minute}`);
  if (!fresh) {
    return NextResponse.json(
      { error: "방금 수집했습니다. 1분 뒤 다시 눌러주세요." },
      { status: 429 },
    );
  }

  const result = await collectDiscord();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
