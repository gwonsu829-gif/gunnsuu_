import { NextResponse } from "next/server";

import { runEval } from "@/lib/eval";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 추출 정확도를 실제로 재는 곳.
 *
 * 만든 사람이 "잘 됩니다"라고 말하는 것과 숫자를 내놓는 것은 다르다.
 * 열 몇 번의 모델 호출이 드는 일이라 5분에 한 번으로 막는다.
 */
async function handle() {
  if (!(process.env.ANTHROPIC_API_KEY ?? "").trim()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY가 없어 측정할 수 없습니다." },
      { status: 503 },
    );
  }

  const slot = Math.floor(Date.now() / (5 * 60 * 1000));
  const fresh = await getStore().markIfUnseen(`eval:${slot}`);
  if (!fresh) {
    return NextResponse.json(
      { error: "방금 측정했습니다. 5분 뒤 다시 시도해주세요." },
      { status: 429 },
    );
  }

  return NextResponse.json(await runEval());
}

export const GET = handle;
export const POST = handle;
