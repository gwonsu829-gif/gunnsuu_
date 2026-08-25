import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

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

  const report: Record<string, unknown> = {
    키가_서버에_전달됨: raw.length > 0,
    키_길이: raw.length,
    앞뒤_공백_있음: raw !== raw.trim(),
    따옴표로_감싸짐: /^["'].*["']$/.test(raw.trim()),
    형식이_맞아보임: key.startsWith("sk-ant-"),
    배포환경: process.env.VERCEL_ENV ?? "local",
    모델: "claude-sonnet-5",
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
