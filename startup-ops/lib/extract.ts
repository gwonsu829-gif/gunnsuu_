import Anthropic from "@anthropic-ai/sdk";

import { heuristicExtract } from "./demo";
import { GeminiError, geminiJson, readGeminiKey } from "./gemini";
import { extractJsonArray, normalizeTasks } from "./parse";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import { ExtractedTask } from "./types";

export const MODEL = "claude-sonnet-5";

export interface ExtractOutcome {
  tasks: ExtractedTask[];
  /** 모델이 아니라 폴백으로 만든 결과인지 */
  demo: boolean;
  demoReason?: string;
  /** 어느 모델이 답했는지 (화면 표시용) */
  provider?: "anthropic" | "gemini";
}

/** 대시보드에 키를 붙여넣을 때 줄바꿈이나 따옴표가 딸려오는 사고가 잦다. */
export function readApiKey(): string {
  return (process.env.ANTHROPIC_API_KEY ?? "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

export type Provider = "anthropic" | "gemini";

/**
 * 어느 모델로 뽑을지.
 *
 * AI_PROVIDER로 못 박을 수 있고, 없으면 키가 있는 쪽을 쓴다. 둘 다 있으면 Claude.
 * 메일 분류는 이 선택과 무관하게 Gemini다(lib/mail.ts) — 그쪽은 구글 계정과 한 묶음이라
 * 키 하나로 끝내는 게 설정 실수가 적다.
 */
export function pickProvider(): Provider | null {
  const forced = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
  if (forced === "gemini" && readGeminiKey()) return "gemini";
  if (forced === "anthropic" && readApiKey()) return "anthropic";
  if (readApiKey()) return "anthropic";
  if (readGeminiKey()) return "gemini";
  return null;
}

async function callAnthropic(text: string, today: string): Promise<string> {
  const client = new Anthropic({ apiKey: readApiKey() });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: buildSystemPrompt(today),
    messages: [{ role: "user", content: buildUserPrompt(text) }],
    output_config: { effort: "medium" },
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
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

  const provider = pickProvider();
  if (!provider) {
    return fallback("ANTHROPIC_API_KEY도 GEMINI_API_KEY도 서버에 전달되지 않았습니다.");
  }

  try {
    const raw =
      provider === "anthropic"
        ? await callAnthropic(text, today)
        : await geminiJson(buildSystemPrompt(today), buildUserPrompt(text), {
            maxOutputTokens: 8000,
          });

    const items = extractJsonArray(raw);
    if (!items) throw new Error("모델 응답에서 JSON 배열을 찾지 못했습니다.");

    // 빈 배열은 진짜로 할일이 없는 원문일 수 있으므로 폴백하지 않는다.
    return { tasks: normalizeTasks(items), demo: false, provider };
  } catch (error) {
    const reason =
      error instanceof Anthropic.APIError
        ? `Anthropic API 오류 ${error.status ?? "(네트워크)"} — ${error.message}`
        : error instanceof GeminiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "알 수 없는 오류";
    console.error("[extract] 폴백:", reason);
    return fallback(reason);
  }
}
