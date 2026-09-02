import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { readBotToken } from "@/lib/discord";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * 배포 환경에서 "왜 데모 모드로 떨어지는지" 확인하기 위한 진단용.
 * 키 값 자체는 절대 반환하지 않는다.
 *
 *   /api/health          키가 서버에 도달했는지만 확인 (호출 없음, 무료)
 *   /api/health?probe=1  실제로 API를 한 번 호출해 키가 유효한지 확인
 */
export async function GET(request: Request) {
  const raw = process.env.ANTHROPIC_API_KEY ?? "";
  const key = raw.trim().replace(/^["']|["']$/g, "");

  const botToken = readBotToken();
  const ingestSecret = (process.env.INGEST_SECRET ?? "").trim();

  const report: Record<string, unknown> = {
    배포환경: process.env.VERCEL_ENV ?? "local",

    AI: {
      키가_서버에_전달됨: raw.length > 0,
      키_길이: raw.length,
      앞뒤_공백_있음: raw !== raw.trim(),
      따옴표로_감싸짐: /^["'].*["']$/.test(raw.trim()),
      형식이_맞아보임: key.startsWith("sk-ant-"),
      모델: "claude-sonnet-5",
    },

    저장소: {
      종류: getStore().kind,
      // 어느 이름으로 들어왔는지까지 보여야 설정 실수를 짚을 수 있다.
      UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL),
      KV_REST_API_URL: Boolean(process.env.KV_REST_API_URL),
      UPSTASH_REDIS_REST_TOKEN: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
      KV_REST_API_TOKEN: Boolean(process.env.KV_REST_API_TOKEN),
    },

    메일수신: {
      INGEST_SECRET_설정됨: ingestSecret.length > 0,
      길이: ingestSecret.length,
    },

    디스코드: {
      DISCORD_BOT_TOKEN_설정됨: botToken.length > 0,
      토큰_길이: botToken.length,
      수집_가능: botToken.length > 0,
      안내:
        botToken.length === 0
          ? "DISCORD_BOT_TOKEN이 서버에 없습니다. 변수 추가 후 재배포했는지 확인하세요."
          : "채널은 환경변수가 아니라 설정 화면에서 고릅니다. 설정 → 디스코드 → 서버 불러오기.",
    },
  };

  const url = new URL(request.url);
  if (url.searchParams.get("probe") !== "1") {
    report.안내 = "실제 호출까지 확인하려면 주소 끝에 ?probe=1 을 붙이세요.";
    return NextResponse.json(report);
  }

  if (!key) {
    report.실제_호출 = "건너뜀 (키 없음)";
    return NextResponse.json(report);
  }

  try {
    const client = new Anthropic({ apiKey: key });
    const res = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 16,
      messages: [{ role: "user", content: "ping. 한 단어로만 답하라." }],
    });
    report.실제_호출 = "성공";
    report.응답_토큰 = res.usage.output_tokens;
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      report.실제_호출 = "실패";
      report.오류_코드 = error.status ?? "network";
      report.오류_메시지 = error.message;
    } else {
      report.실제_호출 = "실패";
      report.오류_메시지 = error instanceof Error ? error.message : String(error);
    }
  }

  return NextResponse.json(report);
}
