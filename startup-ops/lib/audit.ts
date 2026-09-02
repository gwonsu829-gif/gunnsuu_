import { getStore } from "./store";
import { AuditAction, AuditEntry } from "./types";

/**
 * "방금 누가 뭘 바꿨나"를 남긴다.
 *
 * lib/activity.ts의 타임라인과 다르다. 그쪽은 할일 자체의 기록(createdAt, stageAt)을
 * 되읽는 것이고, 여기는 사람의 손길을 적는 곳이다. 세 사람이 한 화면을 쓰면
 * "누가 담당을 바꿨지?"가 가장 자주 나오는 질문이라 따로 둔다.
 *
 * 실패해도 본 작업을 막지 않는다. 이력이 없는 것보다 저장이 안 되는 게 더 나쁘다.
 */
export async function recordAudit(input: {
  who: string;
  action: AuditAction;
  targetId?: string;
  summary: string;
}): Promise<void> {
  const entry: AuditEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    who: input.who || "누군가",
    action: input.action,
    targetId: input.targetId,
    summary: input.summary.slice(0, 200),
  };
  try {
    await getStore().pushAudit(entry);
  } catch (e) {
    console.error("[audit] 기록 실패:", e instanceof Error ? e.message : e);
  }
}

/** 요청 헤더에서 "누가"를 읽는다. 없으면 빈 문자열 — 화면이 이름을 안 골랐다는 뜻. */
export function whoFrom(request: Request): string {
  const raw = request.headers.get("x-ops-user") ?? "";
  try {
    return decodeURIComponent(raw).trim().slice(0, 20);
  } catch {
    return "";
  }
}
