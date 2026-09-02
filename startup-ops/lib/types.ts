export const ROLES = [
  "대표",
  "CS",
  "Sales",
  "개발",
  "마케팅",
  "CX",
  "R&D",
  "지원사업",
  "경영지원",
] as const;

export const PRIORITIES = ["높음", "중간", "낮음"] as const;

export const STATUSES = ["미처리", "진행중", "완료"] as const;

export type Role = (typeof ROLES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Status = (typeof STATUSES)[number];

/** 모델이 반환하는 원형. id 없음. */
export interface ExtractedTask {
  title: string;
  role: Role;
  priority: Priority;
  /** "YYYY-MM-DD" 또는 "미정" */
  dueDate: string;
  assignee: string;
  /** 판단 근거가 된 원문 문장 그대로 */
  source: string;
  status: Status;
}

/**
 * 각 단계를 언제 통과했는지.
 * 지나간 일은 알 수 없으므로 앞으로 생기는 전환만 쌓인다. 모르는 칸은 비워 둔다.
 */
export interface StageAt {
  assigned?: string;
  started?: string;
  done?: string;
}

/**
 * 실제로 손대기로 잡아둔 시간.
 *
 * 마감(dueDate)과 다르다. 마감은 "언제까지"고 이건 "언제 한다"다.
 * 둘을 한 필드로 합치면 "기한은 코앞인데 아직 시간을 못 잡은 일"이
 * 안 보이게 되는데, 주 뷰는 정확히 그 구분 위에 서 있다.
 * 시간을 안 잡은 일은 slot이 없고, 격자가 아니라 왼쪽 목록에 남는다.
 */
export interface Slot {
  /** ISO 8601 (UTC) */
  start: string;
  /** ISO 8601 (UTC). 항상 start보다 뒤. */
  end: string;
}

export type TaskOrigin = "local" | "server";

/** 화면에서 관리하는 할일. 클라이언트에서 id와 출처 원문을 덧붙인다. */
export interface Task extends ExtractedTask {
  id: string;
  /**
   * local  — 이 브라우저에서 붙여넣어 뽑은 것. 새로고침하면 사라진다.
   * server — 메일·디스코드로 자동 수집돼 저장소에 있는 것.
   */
  origin: TaskOrigin;
  /** 어느 채널로 들어왔는지 */
  channel: "manual" | "email" | "discord";
  /** 이 할일이 추출된 원문 전체 (근거 하이라이트에 사용) */
  rawText: string;
  /** 원문 라벨. 예: "CS 문의 메일" */
  sourceLabel: string;
  /** 이미 등록된 할일과 같은 건으로 보이는 경우 */
  duplicateOf?: string;
  stageAt?: StageAt;
  /** 언제 들어왔는지. 붙여넣기로 뽑은 것은 뽑은 시각. */
  createdAt?: string;
  /** 손대기로 잡아둔 시간. 없으면 아직 안 잡은 일. */
  slot?: Slot;
  /** 사람이 덮어쓴 항목. AI 결과를 얼마나 고치는지가 품질 신호다. */
  edited?: { role?: true; priority?: true; assignee?: true };
  /**
   * 세 사람이 같은 화면을 동시에 만지므로, 마지막으로 저장된 판을 번호로 센다.
   * 내가 본 판이 저장된 판보다 낡았으면 서버가 저장을 거절한다(409).
   */
  version?: number;
  updatedAt?: string;
  /** 마지막으로 손댄 사람 이름 */
  updatedBy?: string;
  /** 구글 캘린더에 올라간 이벤트 id. 있으면 slot과 캘린더가 묶여 있다. */
  calendarEventId?: string;
  /** 메일에서 나온 할일이면 그 메일 id (메일함에서 되짚기용) */
  mailId?: string;
}

/* ---------- 메일 ---------- */

/** 메일에 붙는 라벨. 직무 9개 + "참고"(할일 없음). Gmail에는 "업무/<라벨>"로 올라간다. */
export type MailLabel = Role | "참고";

export interface MailRecord {
  /** Gmail message id */
  id: string;
  threadId: string;
  from: string;
  subject: string;
  /** 본문 앞부분 */
  snippet: string;
  /** ISO */
  receivedAt: string;
  /** 최종 라벨 (규칙 + AI). 사람이 고치면 그 값이 남는다. */
  labels: MailLabel[];
  /** 키워드 규칙이 강제한 라벨. AI가 뭐라 하든 유지된다. */
  forced: MailLabel[];
  /** 실제로 누군가 움직여야 하는 메일인지 */
  actionable: boolean;
  /** AI 한 줄 요약 */
  summary: string;
  /** 이 메일에서 뽑힌 할일 id */
  taskIds: string[];
  /** 라벨을 누가 정했는지 */
  classifiedBy: "gemini" | "rule" | "person";
  /** Gmail에 라벨을 실제로 붙였는지 (실패해도 대시보드는 살아 있어야 한다) */
  gmailLabeled: boolean;
  /** 저장 시각 */
  syncedAt: string;
}

/* ---------- 설정 ---------- */

export interface TeamMember {
  name: string;
  /** 화면에 보일 담당 영역. 직무 enum이 아니라 자유 문구 ("마케팅·운영") */
  role: string;
  /** 아바타 배경 (hex) */
  color: string;
}

export interface KeywordRule {
  label: MailLabel;
  keywords: string[];
}

export interface Settings {
  team: TeamMember[];
  keywordRules: KeywordRule[];
  /** Gmail 검색 문법 그대로. 이 조건에 맞는 메일만 가져온다. */
  mailQuery: string;
  /** Gmail 라벨 접두어. "업무" → "업무/CS" */
  labelPrefix: string;
  /** 회사 이름 (인사말·요약에 쓴다) */
  companyName: string;
}

/* ---------- 활동 이력 ---------- */

export type AuditAction =
  | "담당변경"
  | "상태변경"
  | "우선순위변경"
  | "직무변경"
  | "시간잡음"
  | "시간비움"
  | "중복처리"
  | "메일라벨수정"
  | "설정변경"
  | "구글연결"
  | "구글해제";

export interface AuditEntry {
  id: string;
  at: string;
  who: string;
  action: AuditAction;
  /** 대상 할일·메일 id */
  targetId?: string;
  /** 사람이 읽을 한 줄 */
  summary: string;
}

/* ---------- 캘린더 ---------- */

/** 구글 캘린더의 다른 일정. 할일과 무관하지만 겹치면 안 되므로 격자에 흐리게 보인다. */
export interface BusyEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
}

export interface ExtractResponse {
  tasks: ExtractedTask[];
  /** 데모 프리셋으로 응답했는지 여부 */
  demo: boolean;
  /** 데모로 폴백한 이유 (있으면 화면 툴팁에 노출) */
  demoReason?: string;
}
