import { NextResponse } from "next/server";

import { todayISO } from "@/lib/dates";
import { runExtraction } from "@/lib/extract";
import { SampleId, presetToTasks } from "@/lib/samples";
import { ExtractResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SAMPLE_IDS: SampleId[] = ["cs-mail", "grant-mail", "dev-discord"];

export async function POST(request: Request) {
  const today = todayISO();

  let text = "";
  let sampleId: string | undefined;
  try {
    const body = (await request.json()) as { text?: string; sampleId?: string };
    text = (body.text ?? "").trim();
    sampleId = body.sampleId;
  } catch {
    return NextResponse.json({ error: "요청 본문을 읽을 수 없습니다." }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ error: "분석할 원문이 비어 있습니다." }, { status: 400 });
  }

  const outcome = await runExtraction(text, today, () =>
    SAMPLE_IDS.includes(sampleId as SampleId)
      ? presetToTasks(sampleId as SampleId, today)
      : null,
  );

  return NextResponse.json({
    tasks: outcome.tasks,
    demo: outcome.demo,
    demoReason: outcome.demoReason,
  } satisfies ExtractResponse);
}
