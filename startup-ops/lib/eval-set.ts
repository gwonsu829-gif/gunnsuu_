import { Role } from "./types";

/**
 * 추출 정확도를 재기 위한 정답지.
 *
 * "AI가 들어갈 자리를 제대로 잡았는가"는 결국 이 숫자로만 말할 수 있다.
 * 그래서 실제로 들어올 법한 원문을 쓰고, 무엇이 정답인지 사람이 먼저 적어둔다.
 *
 * 마감이 상대 표현("이번 주 금요일")으로 적혀 있으므로 정답도 실행일 기준으로
 * 계산한다. 절대 날짜를 박아두면 하루만 지나도 측정이 거짓말을 한다.
 */

export type DueSpec =
  | { kind: "offset"; days: number }
  | { kind: "weekday"; weekday: number }
  | { kind: "nextWeekMonday" }
  | { kind: "nextWeekWeekday"; weekday: number }
  | { kind: "none" };

export interface ExpectedTask {
  /** 뽑힌 제목에 이 낱말들이 모두 들어 있으면 같은 할일로 본다.
   *  배열이면 그중 하나만 있으면 된다 (표현이 갈리는 자리). */
  keywords: (string | string[])[];
  role: Role;
  /** 직무 판단이 갈릴 수 있는 자리는 여기에 대안을 적는다. */
  roleAlt?: Role[];
  due: DueSpec;
}

export interface EvalCase {
  id: string;
  label: string;
  channel: "email" | "discord";
  text: string;
  expected: ExpectedTask[];
}

export const EVAL_SET: EvalCase[] = [
  {
    id: "cs-daon",
    label: "CS 문의 메일 (다온컴퍼니)",
    channel: "email",
    text: `보낸사람: 다온컴퍼니 운영팀 <ops@daoncompany.co.kr>
제목: [다온컴퍼니] 회의 녹음 끊김 문의드립니다

안녕하세요, 다온컴퍼니 운영팀입니다.

어제 오후 화상회의에서 녹음이 두 번 끊겼습니다.
회의록도 중간부터 비어 있어서 확인 부탁드립니다. 필요하시면 로그 보내드리겠습니다.
가능하면 이번 주 금요일까지 원인 회신 부탁드립니다.

그리고 다음 달부터 팀 인원이 12명으로 늘어날 예정이라
플랜 증설 견적도 함께 보내주시면 감사하겠습니다.

감사합니다.`,
    expected: [
      {
        keywords: [["녹음", "회의록"], ["끊김", "오류", "원인", "확인"]],
        role: "개발",
        roleAlt: ["CS"],
        due: { kind: "weekday", weekday: 5 },
      },
      {
        keywords: [["플랜", "증설"], ["견적", "발송", "전달", "회신"]],
        role: "Sales",
        due: { kind: "none" },
      },
    ],
  },
  {
    id: "dev-thread",
    label: "디스코드 개발 스레드 (8월 배포)",
    channel: "discord",
    text: `[#개발 › 8월 배포]

정민 — 8/25 오전 10:12
스테이징에 올린 STT 모델 v2요, 긴 회의에서 화자 분리가 자꾸 깨집니다

서연 — 8/25 오전 10:15
샘플 3개만 주시면 오늘 안에 재현해볼게요

정민 — 8/25 오전 10:16
넵 올려둘게요. 그리고 배포는 다음 주 월요일로 미루죠

서연 — 8/25 오전 10:18
그럼 릴리즈 노트는 제가 금요일까지 정리해두겠습니다`,
    expected: [
      {
        keywords: [["화자", "분리", "STT"], ["재현", "확인", "테스트"]],
        role: "개발",
        due: { kind: "offset", days: 0 },
      },
      {
        keywords: [["배포"]],
        role: "개발",
        due: { kind: "nextWeekMonday" },
      },
      {
        keywords: [["릴리즈", "노트"], ["정리", "작성"]],
        role: "개발",
        due: { kind: "weekday", weekday: 5 },
      },
    ],
  },
  {
    id: "grant",
    label: "지원사업 공고 메일",
    channel: "email",
    text: `보낸사람: 창업진흥원 <noreply@kised.or.kr>
제목: 2026년 3차 창업도약패키지 참여기업 모집 공고

2026년 3차 창업도약패키지 참여기업을 모집합니다.

○ 접수 마감: 다음 주 수요일 18:00
○ 제출 서류
  - 사업계획서 (지정 양식)
  - 최근 3개년 재무제표
○ 지원 규모: 최대 1억원

기한 내 미제출 시 심사 대상에서 제외되오니 유의하시기 바랍니다.`,
    expected: [
      {
        keywords: [["사업계획서"]],
        role: "지원사업",
        due: { kind: "nextWeekWeekday", weekday: 3 },
      },
      {
        keywords: [["재무제표"]],
        role: "경영지원",
        roleAlt: ["지원사업"],
        due: { kind: "nextWeekWeekday", weekday: 3 },
      },
    ],
  },
  {
    id: "ceo-notice",
    label: "디스코드 대표 공지 (마케팅)",
    channel: "discord",
    text: `[#일반]

진영 — 8/25 오후 2:03
다음 주에 블로그 개편이 나가야 해서, 랜딩 카피 초안을 이번 주 금요일까지 부탁드려요

진영 — 8/25 오후 2:04
그리고 9월 뉴스레터 발송일도 확정해서 알려주세요`,
    expected: [
      {
        keywords: [["랜딩", "카피"], ["초안", "작성"]],
        role: "마케팅",
        due: { kind: "weekday", weekday: 5 },
      },
      {
        keywords: [["뉴스레터"], ["발송일", "일정", "확정"]],
        role: "마케팅",
        due: { kind: "none" },
      },
    ],
  },
  {
    id: "cx-onboarding",
    label: "CX 온보딩 메일",
    channel: "email",
    text: `보낸사람: 김서준 <sjkim@lumenlab.kr>
제목: 온보딩 일정 문의

안녕하세요, 루멘랩 김서준입니다.

지난주 계약 마무리해주셔서 감사합니다.
내부 팀 교육을 다음 주 중에 진행하려고 하는데, 온보딩 세션 일정을 잡아주실 수 있을까요?
참여 인원은 8명 정도 예상됩니다.

아, 그리고 계약서에 적힌 담당자 이메일이 잘못 기재되어 있어 수정본을 요청드립니다.
이건 급하니 내일까지 부탁드립니다.`,
    expected: [
      {
        keywords: [["온보딩"], ["일정", "세션", "조율", "잡"]],
        role: "CX",
        due: { kind: "none" },
      },
      {
        keywords: [["계약서"], ["수정", "재발송", "정정"]],
        role: "경영지원",
        roleAlt: ["CX", "Sales"],
        due: { kind: "offset", days: 1 },
      },
    ],
  },
  {
    id: "noise-newsletter",
    label: "할일 없는 메일 (오탐 확인용)",
    channel: "email",
    text: `보낸사람: 스타트업위클리 <hello@startupweekly.kr>
제목: [뉴스레터] 이번 주 스타트업 소식

이번 주 주요 소식을 전해드립니다.

· AI 음성 기록 시장, 올해 40% 성장 전망
· 시리즈A 라운드 평균 규모 축소세
· 개발자 채용 시장 동향 리포트 공개

구독 해지는 하단 링크를 눌러주세요.`,
    expected: [],
  },
  {
    id: "sales-thread",
    label: "디스코드 영업 스레드",
    channel: "discord",
    text: `[#영업 › 하반기 파이프라인]

지우 — 8/25 오후 4:40
한빛교육 데모 잘 끝났습니다. 도입 검토해보시겠다고 하네요

지우 — 8/25 오후 4:41
제안서에 교육기관 전용 단가표가 없어서 따로 만들어야 할 것 같아요

수민 — 8/25 오후 4:52
그럼 제가 단가표 초안 잡아볼게요. 목요일까지 드리겠습니다

지우 — 8/25 오후 4:53
넵 그리고 한빛교육 후속 미팅은 다음 주 월요일로 잡아두겠습니다`,
    expected: [
      {
        keywords: [["단가표"], ["초안", "작성", "제작"]],
        role: "Sales",
        due: { kind: "weekday", weekday: 4 },
      },
      {
        keywords: [["한빛교육", "후속"], ["미팅", "일정"]],
        role: "Sales",
        due: { kind: "nextWeekMonday" },
      },
    ],
  },
];
