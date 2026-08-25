import Anthropic from "@anthropic-ai/sdk";

import { heuristicExtract } from "./demo";
import { extractJsonArray, normalizeTasks } from "./parse";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import { Usage } from "./cost";
import { ExtractedTask } from "./types";

export const MODEL = "claude-sonnet-5";

export interface ExtractOutcome {
  tasks: ExtractedTask[];
  /** 모델이 아니라 폴백으로 만든 결과인지 */
  demo: boolean;
  demoReason?: string;
  /** 실제 모델 호출이 있었을 때만 채워진다. */
  usage?: Usage;
}

/** 대시보드에 키를 붙여넣을 때 줄바꿈이나 따옴표가 딸려오는 사고가 잦다. */
export function readApiKey(): string {
  return (process.env.ANTHROPIC_API_KEY ?? "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

/**
 * 원문 한 덩어리에서 할일을 뽑는다.
 * 붙여넣기·메일·디스코드가 모두 이 함수를 지난다.
 *
 * onFallback: 샘플처럼 미리 정의된 결과가 있으면 그걸 쓰기 위한 후크.
 *             없으면 원문 기반 최소 추출기로 떨어진다.
 */
export async function runExtraction(
  text: string,
  today: string,
  onFallback?: () => ExtractedTask[] | null,
): Promise<ExtractOutcome> {
  const fallback = (reason: string): ExtractOutcome => ({
    tasks: onFallback?.() ?? heuristicExtract(text, today),
    demo: true,
    demoReason: reason,
  });

  const apiKey = readApiKey();
  if (!apiKey) {
    return fallback("ANTHROPIC_API_KEY가 서버에 전달되지 않았습니다.");
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: buildSystemPrompt(today),
      messages: [{ role: "user", content: buildUserPrompt(text) }],
      output_config: { effort: "medium" },
    });

    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const items = extractJsonArray(raw);
    if (!items) throw new Error("모델 응답에서 JSON 배열을 찾지 못했습니다.");

    // 빈 배열은 진짜로 할일이 없는 원문일 수 있으므로 폴백하지 않는다.
    return {
      tasks: normalizeTasks(items),
      demo: false,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  } catch (error) {
    const reason =
      error instanceof Anthropic.APIError
        ? `Anthropic API 오류 ${error.status ?? "(네트워크)"} — ${error.message}`
        : error instanceof Error
          ? error.message
          : "알 수 없는 오류";
    console.error("[extract] 폴백:", reason);
    return fallback(reason);
  }
}
