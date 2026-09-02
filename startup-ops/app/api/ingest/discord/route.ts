import { NextResponse } from "next/server";

import { collectDiscord } from "@/lib/discord-collect";
import { checkCronAuth } from "@/lib/webhook-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 외부 크론 서비스가 부르는 곳 (예전 주소. Vercel 크론은 /api/discord/sync를 쓴다).
 * 주소를 이미 등록해 둔 곳이 있을 수 있어 남겨 둔다.
 */
export async function GET(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const result = await collectDiscord({ force: true });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}

export const POST = GET;
