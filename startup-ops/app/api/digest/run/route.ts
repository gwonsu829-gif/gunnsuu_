import { NextResponse } from "next/server";

import { todayISO } from "@/lib/dates";
import { buildDigest } from "@/lib/digest";
import { readBotToken, readDigestChannelId, sendMessage } from "@/lib/discord";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * 화면의 "아침 요약" 버튼이 부르는 곳.
 * 비밀을 브라우저에 둘 수 없어 이 경로만 서버가 대신 인증한다.
 */
export async function POST(request: Request) {
  if (!(process.env.INGEST_SECRET ?? "").trim()) {
    return NextResponse.json(
      { error: "INGEST_SECRET이 설정되지 않아 꺼져 있습니다." },
      { status: 503 },
    );
  }

  const send = new URL(request.url).searchParams.get("send") === "1";
  const today = todayISO();
  const tasks = await getStore().listTasks();
  const origin =
    (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "") ||
    new URL(request.url).origin;
  const digest = buildDigest(tasks, today, origin);

  if (!send) {
    return NextResponse.json({ 임박: digest.count, 본문: digest.text });
  }

  const token = readBotToken();
  const channelId = readDigestChannelId();
  if (!token || !channelId) {
    return NextResponse.json(
      { error: "디스코드 봇 토큰이나 보낼 채널이 없습니다.", 본문: digest.text },
      { status: 503 },
    );
  }

  try {
    await sendMessage(token, channelId, digest.text);
    return NextResponse.json({ 전송: "성공", 임박: digest.count, 본문: digest.text });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        안내: "봇에 그 채널의 메시지 보내기 권한이 있는지 확인하세요.",
        본문: digest.text,
      },
      { status: 502 },
    );
  }
}
