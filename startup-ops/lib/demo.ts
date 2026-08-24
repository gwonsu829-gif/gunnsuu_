import { addDays, todayISO } from "./dates";
import { ExtractedTask, Priority, Role } from "./types";

/**
 * 샘플이 아닌 임의의 텍스트를 붙여넣었는데 API도 못 쓰는 상황을 위한 최소 추출기.
 * 정확도가 목적이 아니라 "시연 중 빈 화면이 나오지 않는 것"이 목적이다.
 */

const ACTION_CUES = [
  "부탁", "요청", "해주세요", "주세요", "회신", "답변", "확인",
  "제출", "준비", "검토", "신청", "발급", "공유", "정리", "수정",
  "마감", "까지", "하겠습니다", "할게요", "해야", "필요합니다", "예정",
];

const ROLE_CUES: [Role, string[]][] = [
  ["개발", ["배포", "버그", "오류", "서버", "코드", "API", "에러", "장애", "로그", "재현", "구현", "리팩터"]],
  ["CS", ["문의", "회신", "고객사", "티켓", "응대", "클레임", "인입"]],
  ["Sales", ["견적", "계약", "제안서", "미팅", "리드", "영업", "증설", "갱신"]],
  ["지원사업", ["공고", "지원사업", "사업계획서", "선정", "R&D과제", "정부지원", "패키지"]],
  ["경영지원", ["증명서", "4대보험", "세금", "급여", "정산", "세무", "계산서", "등기"]],
  ["마케팅", ["광고", "콘텐츠", "블로그", "SNS", "랜딩", "캠페인", "뉴스레터"]],
  ["CX", ["온보딩", "이탈", "리텐션", "사용자 인터뷰", "NPS", "만족도"]],
  ["R&D", ["실험", "리서치", "모델", "논문", "벤치마크", "프로토타입"]],
];

const HIGH_CUES = ["오늘", "긴급", "즉시", "당장", "장애", "마감", "누락"];

function guessRole(sentence: string): Role {
  for (const [role, cues] of ROLE_CUES) {
    if (cues.some((c) => sentence.includes(c))) return role;
  }
  return "대표";
}

function guessPriority(sentence: string): Priority {
  if (HIGH_CUES.some((c) => sentence.includes(c))) return "높음";
  if (sentence.includes("까지") || sentence.includes("이번 주")) return "중간";
  return "낮음";
}

function guessDue(sentence: string, today: string): string {
  const explicit = sentence.match(/(\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/);
  if (explicit) {
    return `${explicit[1]}-${explicit[2].padStart(2, "0")}-${explicit[3].padStart(2, "0")}`;
  }
  if (sentence.includes("오늘") || sentence.includes("금일")) return today;
  if (sentence.includes("내일") || sentence.includes("익일")) return addDays(today, 1);
  if (sentence.includes("모레")) return addDays(today, 2);
  if (sentence.includes("이번 주")) return nextWeekday(today, 5);
  if (sentence.includes("다음 주")) return addDays(nextWeekday(today, 1), 7);
  return "미정";
}

/** 오늘 이후로 가장 가까운 해당 요일 (1=월 … 5=금) */
function nextWeekday(today: string, target: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const diff = (target - cur + 7) % 7;
  return addDays(today, diff === 0 ? 7 : diff);
}

function guessAssignee(sentence: string): string {
  const honorific = sentence.match(/([가-힣]{2,4})\s*(님|씨|매니저|대표|팀장)/);
  if (honorific) return honorific[1];
  return "미지정";
}

function toTitle(sentence: string): string {
  const cleaned = sentence
    .replace(/^[-*·•\s]+/, "")
    .replace(/^\[[^\]]*\]\s*/, "")
    .replace(/[.!?]+$/, "")
    .trim();
  return cleaned.length > 60 ? `${cleaned.slice(0, 58)}…` : cleaned;
}

export function heuristicExtract(
  text: string,
  today: string = todayISO(),
): ExtractedTask[] {
  const sentences = text
    .split(/\n+|(?<=[.!?。])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8 && s.length <= 200)
    // 디스코드 발화자 헤더("박서연 — 오전 10:12")는 할일이 아니다
    .filter((s) => !/^[가-힣A-Za-z]{2,10}\s*[—-]\s*(오전|오후|\d)/.test(s));

  const picked = sentences.filter((s) => ACTION_CUES.some((c) => s.includes(c)));

  const tasks = (picked.length > 0 ? picked : sentences).slice(0, 5).map(
    (sentence): ExtractedTask => ({
      title: toTitle(sentence),
      role: guessRole(sentence),
      priority: guessPriority(sentence),
      dueDate: guessDue(sentence, today),
      assignee: guessAssignee(sentence),
      source: sentence,
      status: "미처리",
    }),
  );

  if (tasks.length > 0) return tasks;

  return [
    {
      title: "붙여넣은 원문 검토하고 할일 직접 정리하기",
      role: "대표",
      priority: "중간",
      dueDate: today,
      assignee: "미지정",
      source: text.trim().slice(0, 120),
      status: "미처리",
    },
  ];
}
