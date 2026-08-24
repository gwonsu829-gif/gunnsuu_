import {
  ExtractedTask,
  PRIORITIES,
  Priority,
  ROLES,
  Role,
  Status,
} from "./types";

/**
 * 모델이 코드펜스나 앞뒤 설명을 붙였을 때를 대비해
 * 텍스트에서 첫 번째 JSON 배열을 잘라낸다.
 */
export function extractJsonArray(raw: string): unknown[] | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");

  const direct = tryParseArray(trimmed);
  if (direct) return direct;

  const start = trimmed.indexOf("[");
  if (start === -1) return null;

  // 대괄호 짝을 세면서 배열의 끝을 찾는다 (문자열 안의 괄호는 건너뛴다).
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return tryParseArray(trimmed.slice(start, i + 1));
    }
  }
  return null;
}

function tryParseArray(s: string): unknown[] | null {
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeRole(v: unknown): Role {
  const s = asString(v);
  const hit = ROLES.find((r) => r === s);
  if (hit) return hit;
  // 대소문자·표기 흔들림 흡수 (예: "cs", "sales", "R & D")
  const compact = s.toLowerCase().replace(/[\s&·]/g, "");
  const loose = ROLES.find(
    (r) => r.toLowerCase().replace(/[\s&·]/g, "") === compact,
  );
  return loose ?? "경영지원";
}

function normalizePriority(v: unknown): Priority {
  const s = asString(v);
  return PRIORITIES.find((p) => p === s) ?? "중간";
}

function normalizeDue(v: unknown): string {
  const s = asString(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // "2026. 9. 4." / "2026/09/04" 같은 표기를 흡수
  const m = s.match(/(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return "미정";
}

/** 모델 출력이 어떻게 흔들리든 화면이 그릴 수 있는 형태로 맞춘다. */
export function normalizeTasks(items: unknown[]): ExtractedTask[] {
  const out: ExtractedTask[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const title = asString(rec.title);
    if (!title) continue;
    out.push({
      title,
      role: normalizeRole(rec.role),
      priority: normalizePriority(rec.priority),
      dueDate: normalizeDue(rec.dueDate),
      assignee: asString(rec.assignee) || "미지정",
      source: asString(rec.source),
      status: "미처리" as Status,
    });
  }
  return out;
}
