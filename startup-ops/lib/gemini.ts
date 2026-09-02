/**
 * Gemini 호출. SDK 없이 REST로 부른다 — 의존성 하나에 프로젝트 빌드를 걸고 싶지 않고,
 * 필요한 건 "텍스트 넣고 JSON 받기" 하나뿐이다.
 */

export function readGeminiKey(): string {
  return (process.env.GEMINI_API_KEY ?? "").trim().replace(/^["']|["']$/g, "");
}

/**
 * 기본은 가격·속도 균형이 맞는 flash. 환경변수로 바꿀 수 있다.
 * (모델 이름은 자주 바뀌므로 코드에 박지 않는다.)
 */
export function geminiModel(): string {
  return (process.env.GEMINI_MODEL ?? "").trim() || "gemini-2.5-flash";
}

export class GeminiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

interface GenerateResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

/**
 * JSON만 돌려받는다. responseMimeType을 걸어 두면 모델이 코드펜스나 설명을 붙이지 않는다.
 * 그래도 파싱은 호출한 쪽이 한다 — 모양 검증은 도메인 쪽 책임이다.
 */
export async function geminiJson(
  system: string,
  user: string,
  opts: { timeoutMs?: number; maxOutputTokens?: number } = {},
): Promise<string> {
  const key = readGeminiKey();
  if (!key) throw new GeminiError("GEMINI_API_KEY가 서버에 전달되지 않았습니다.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 40_000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            responseMimeType: "application/json",
            // 분류·추출은 창의성이 아니라 일관성이 필요하다.
            temperature: 0.2,
            maxOutputTokens: opts.maxOutputTokens ?? 4096,
          },
        }),
        signal: controller.signal,
        cache: "no-store",
      },
    );

    const body = (await res.json().catch(() => ({}))) as GenerateResponse;
    if (!res.ok) {
      throw new GeminiError(
        `Gemini API 오류 ${res.status} — ${body.error?.message ?? res.statusText}`,
        res.status,
      );
    }
    if (body.promptFeedback?.blockReason) {
      throw new GeminiError(`Gemini가 입력을 거부함 (${body.promptFeedback.blockReason})`);
    }
    const text = (body.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
    if (!text.trim()) throw new GeminiError("Gemini 응답이 비어 있습니다.");
    return text;
  } catch (e) {
    if (e instanceof GeminiError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new GeminiError("Gemini 응답 시간 초과");
    }
    throw new GeminiError(e instanceof Error ? e.message : "알 수 없는 오류");
  } finally {
    clearTimeout(timer);
  }
}
