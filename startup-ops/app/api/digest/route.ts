import { NextResponse } from "next/server";

import { todayISO } from "@/lib/dates";
import { buildDigest } from "@/lib/digest";
import { readBotToken, readDigestChannelId, sendMessage } from "@/lib/discord";
import { getStore } from "@/lib/store";
import { checkCronAuth } from "@/lib/webhook-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function appUrl(request: Request): string {
  const env = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (env) return env.replace(/\/$/, "");
  return new URL(request.url).origin;
}

/**
 * 아침 요약. 크론이 부르면 디스코드로 보내고,
 * ?preview=1 이면 보내지 않고 본문만 돌려준다.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const preview = url.searchParams.get("preview") === "1";

  const auth = checkCronAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const today = todayISO();
  const tasks = await getStore().listTasks();
  const digest = buildDigest(tasks, today, appUrl(request));

  if (preview) {
    return NextResponse.json({ 미리보기: true, 임박: digest.count, 본문: digest.text });
  }

  const token = readBotToken();
  const channelId = readDigestChannelId();
  if (!token || !channelId) {
    return NextResponse.json(
      {
        error:
          "디스코드로 보낼 수 없습니다. DISCORD_BOT_TOKEN과 보낼 채널(DISCORD_DIGEST_CHANNEL 또는 DISCORD_CHANNELS)이 필요합니다.",
        본문: digest.text,
      },
      { status: 503 },
    );
  }

  try {
    await sendMessage(token, channelId, digest.text);
    return NextResponse.json({ 전송: "성공", 임박: digest.count, 채널: channelId });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        안내: "봇에 해당 채널의 메시지 보내기 권한이 있는지 확인하세요.",
        본문: digest.text,
      },
      { status: 502 },
    );
  }
}

export const POST = GET;
