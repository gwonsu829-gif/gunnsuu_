import { NextResponse } from "next/server";

import { clearBlocked, lastSyncAt } from "@/lib/discord-collect";
import {
  DiscordError,
  fetchGuildChannels,
  fetchGuilds,
  readBotToken,
  resolveGuildId,
} from "@/lib/discord";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * 설정 화면의 "서버 불러오기".
 *
 * 봇이 들어간 서버와 그 채널을 그대로 돌려준다. 사람이 채널 ID를 복사해
 * 환경변수에 넣을 필요가 없어지는 지점이 여기다.
 * ?guild=<id> 로 다른 서버를 볼 수 있다 (봇이 여러 서버에 있을 때).
 */
export async function GET(request: Request) {
  const token = readBotToken();
  if (!token) {
    return NextResponse.json(
      {
        configured: false,
        error: "DISCORD_BOT_TOKEN이 서버에 없습니다. 환경변수에 넣고 재배포하세요.",
        guilds: [],
        channels: [],
      },
      { status: 200 },
    );
  }

  const settings = await getStore().getSettings();
  const asked = new URL(request.url).searchParams.get("guild") ?? "";

  try {
    const guilds = await fetchGuilds(token);
    const guildId = /^\d{5,25}$/.test(asked)
      ? asked
      : await resolveGuildId(token, settings.discord);
    const channels = await fetchGuildChannels(token, guildId);
    return NextResponse.json({
      configured: true,
      guilds,
      guildId,
      channels,
      lastSyncAt: await lastSyncAt(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        configured: true,
        error:
          error instanceof DiscordError
            ? error.message
            : "디스코드에서 목록을 읽지 못했습니다.",
        guilds: [],
        channels: [],
      },
      { status: 200 },
    );
  }
}

/** 권한을 고친 뒤 "못 읽는 채널" 기억을 지운다. */
export async function DELETE() {
  await clearBlocked();
  return NextResponse.json({ ok: true });
}
