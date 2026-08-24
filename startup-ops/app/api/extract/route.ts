import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { todayISO } from "@/lib/dates";
import { heuristicExtract } from "@/lib/demo";
import { extractJsonArray, normalizeTasks } from "@/lib/parse";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/prompt";
import { SampleId, presetToTasks } from "@/lib/samples";
import { ExtractResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-5";
const SAMPLE_IDS: SampleId[] = ["cs-mail", "grant-mail", "dev-discord"];

/** 샘플이면 미리 정의한 결과를, 아니면 원문 기반 최소 추출 결과를 돌려준다. */
function demoResult(
  text: string,
  sampleId: string | undefined,
  today: string,
  reason: string,
): ExtractResponse {
  const isSample = SAMPLE_IDS.includes(sampleId as SampleId);
  return {
    tasks: isSample
      ? presetToTasks(sampleId as SampleId, today)
      : heuristicExtract(text, today),
    demo: true,
    demoReason: reason,
  };
}

export async function POST(request: Request) {
  const today = todayISO();

  let text = "";
  let sampleId: string | undefined;
  try {
    const body = (await request.json()) as { text?: string; sampleId?: string };
    text = (body.text ?? "").trim();
    sampleId = body.sampleId;
  } catch {
    return NextResponse.json(
      { error: "요청 본문을 읽을 수 없습니다." },
      { status: 400 },
    );
  }

  if (!text) {
    return NextResponse.json(
      { error: "분석할 원문이 비어 있습니다." },
      { status: 400 },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      demoResult(text, sampleId, today, "ANTHROPIC_API_KEY가 설정되지 않았습니다."),
    );
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: buildSystemPrompt(today),
      messages: [{ role: "user", content: buildUserPrompt(text) }],
      output_config: { effort: "medium" },
    });

    const raw = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const items = extractJsonArray(raw);
    if (!items) {
      throw new Error("모델 응답에서 JSON 배열을 찾지 못했습니다.");
    }

    const tasks = normalizeTasks(items);
    if (tasks.length === 0) {
      // 진짜로 할일이 없는 원문일 수 있으므로 데모 폴백 없이 그대로 돌려준다.
      return NextResponse.json({ tasks: [], demo: false } satisfies ExtractResponse);
    }

    return NextResponse.json({ tasks, demo: false } satisfies ExtractResponse);
  } catch (error) {
    const reason =
      error instanceof Anthropic.APIError
        ? `Anthropic API 오류 (${error.status ?? "network"})`
        : error instanceof Error
          ? error.message
          : "알 수 없는 오류";
    console.error("[extract] 데모 모드로 폴백:", reason);
    return NextResponse.json(demoResult(text, sampleId, today, reason));
  }
}
