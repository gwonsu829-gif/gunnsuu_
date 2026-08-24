import {
  addDays,
  formatKoreanDate,
  nextWeekMonday,
  todayISO,
  upcomingWeekday,
} from "./dates";
import { ExtractedTask } from "./types";

export type SampleId = "cs-mail" | "grant-mail" | "dev-discord";

export interface Sample {
  id: SampleId;
  label: string;
  hint: string;
  text: string;
}

/**
 * 프리셋 마감일은 절대 날짜로 굳히지 않는다. 시연 날짜가 언제든
 * 원문의 "이번 주 금요일" 같은 표현과 결과가 어긋나지 않게 하기 위해서다.
 */
type PresetDue =
  | { kind: "미정" }
  | { kind: "offset"; days: number }
  | { kind: "weekday"; weekday: number } // 이번 주 해당 요일 (오늘 포함)
  | { kind: "nextWeekMonday" };

type PresetTask = Omit<ExtractedTask, "dueDate" | "status" | "source"> & {
  due: PresetDue;
  /**
   * source는 원문에 글자 그대로 존재해야 한다 (카드 클릭 시 하이라이트가 여기에 걸린다).
   * 원문에 날짜가 끼어 있는 문장은 함수로 두어 같은 날짜를 다시 만들어 쓴다.
   */
  source: string | ((today: string) => string);
};

function resolveDue(due: PresetDue, today: string): string {
  switch (due.kind) {
    case "미정":
      return "미정";
    case "offset":
      return addDays(today, due.days);
    case "weekday":
      return upcomingWeekday(today, due.weekday);
    case "nextWeekMonday":
      return nextWeekMonday(today);
  }
}

/**
 * 샘플 원문은 오늘 날짜를 기준으로 만들어진다.
 * 데모 프리셋도 같은 기준을 쓰므로 언제 시연해도 원문과 결과의 날짜가 어긋나지 않는다.
 */
export function buildSamples(today: string = todayISO()): Sample[] {
  const briefingApply = addDays(today, 2);
  const briefing = addDays(today, 3);
  const deadline = addDays(today, 11);

  return [
    {
      id: "cs-mail",
      label: "CS 문의 메일",
      hint: "고객사 오류 신고",
      text: `보낸사람: 최지우 <jw.choi@daoncompany.co.kr>
받는사람: support@notely.kr
제목: [다온컴퍼니] 회의록 요약이 중간에 끊깁니다 - 확인 부탁드립니다

안녕하세요, 다온컴퍼니 운영팀 최지우입니다.

지난주 목요일부터 30분이 넘는 회의 녹음을 올리면 요약본이 절반쯤에서 끊긴 채로 생성됩니다. 같은 파일로 세 번 재시도했지만 결과가 동일했고, 20분 내외 파일은 정상 동작합니다.

이번 주 수요일 임원 보고에 해당 요약본을 사용해야 해서 일정이 촉박합니다. 오늘 중으로 조치 가능 여부와 예상 일정을 회신 부탁드립니다.

참고로 다음 달 갱신 때 팀 플랜을 5석에서 10석으로 증설하는 것을 검토 중인데, 이번 건 처리 결과를 보고 결정하려고 합니다.

감사합니다.
최지우 드림`,
    },
    {
      id: "grant-mail",
      label: "지원사업 공고 메일",
      hint: "서류 마감 명시",
      text: `보낸사람: 서울창업허브 사업운영팀 <notice@seoulstartuphub.or.kr>
받는사람: notely.official@gmail.com
제목: [공고] 2026년 하반기 창업도약패키지 참여기업 모집 안내

안녕하세요. 서울창업허브 사업운영팀입니다.
2026년 하반기 창업도약패키지 참여기업을 아래와 같이 모집합니다.

- 지원 대상: 업력 3년 이상 7년 이내 창업기업
- 지원 규모: 기업당 최대 1억원 (사업화 자금)
- 접수 마감: ${formatKoreanDate(deadline)} 18:00 (온라인 접수, 마감 이후 접수 불가)
- 제출 서류: 사업계획서(지정 양식), 최근 3개년 재무제표, 4대보험 가입자명부, 국세 및 지방세 완납증명서
- 온라인 사업설명회: ${formatKoreanDate(briefing)} 14:00 (사전 신청자에 한해 참여 링크 발송, 신청은 ${formatKoreanDate(briefingApply)}까지)

사업계획서는 반드시 첨부된 지정 양식으로 작성해 주시기 바라며, 증명서류는 발급일 기준 1개월 이내 발급분만 인정됩니다. 마감 직전에는 접수 시스템 접속이 지연될 수 있으니 여유를 두고 제출해 주십시오.

문의: 02-0000-0000`,
    },
    {
      id: "dev-discord",
      label: "개발 디스코드",
      hint: "대화 중 할일 혼재",
      text: `[#dev-일반]

박서연 — 오전 10:12
어제 배포 이후로 워커 메모리가 계속 우상향이에요. 새벽 3시쯤 한 번 OOM으로 재시작됐고요.

김도현 — 오전 10:15
사용자한테 영향 갔나요?

박서연 — 오전 10:16
그 시간대 요청 3건은 재시도로 다 성공했습니다. 다만 다온컴퍼니에서 올린 30분 이상 녹음 건은 여전히 요약이 중간에 잘려서 나와요. 이건 메모리랑 별개 이슈로 보입니다.

이수민 — 오전 10:20
아 그 건 어제 CS 메일로도 들어왔어요. 최지우 매니저님이 오늘 중으로 회신 달라고 하셨습니다.

박서연 — 오전 10:23
그럼 제가 오전에 재현부터 해볼게요. 메모리 쪽은 오늘 내로는 못 볼 것 같고 내일 오전에 프로파일링 돌려보겠습니다.

김도현 — 오전 10:31
좋습니다. 그리고 결제 웹훅 재시도 로직 아직 안 들어갔죠? 이번 주 금요일까지는 넣어주세요. 지난달에 그것 때문에 환불 한 건 수동으로 처리했잖아요.

박서연 — 오전 10:33
넵 금요일까지 하겠습니다.

이수민 — 오전 10:40
그리고 다음 주 초까지 9월 온보딩 이메일 문구 초안 공유드릴게요. 가입하고 3일 안에 이탈하는 비율이 높아서 손봐야 할 것 같아요.`,
    },
  ];
}

/** API 키가 없거나 호출이 실패했을 때 대신 내보내는 결과. */
export const DEMO_PRESETS: Record<SampleId, PresetTask[]> = {
  "cs-mail": [
    {
      title: "30분 이상 녹음의 요약 잘림 오류 재현하고 원인 파악하기",
      role: "개발",
      priority: "높음",
      due: { kind: "offset", days: 0 },
      assignee: "미지정",
      source:
        "지난주 목요일부터 30분이 넘는 회의 녹음을 올리면 요약본이 절반쯤에서 끊긴 채로 생성됩니다.",
    },
    {
      title: "최지우 매니저에게 조치 가능 여부와 예상 일정 회신하기",
      role: "CS",
      priority: "높음",
      due: { kind: "offset", days: 0 },
      assignee: "미지정",
      source:
        "오늘 중으로 조치 가능 여부와 예상 일정을 회신 부탁드립니다.",
    },
    {
      title: "다온컴퍼니 팀 플랜 10석 증설 제안 준비하기",
      role: "Sales",
      priority: "중간",
      due: { kind: "미정" },
      assignee: "미지정",
      source:
        "다음 달 갱신 때 팀 플랜을 5석에서 10석으로 증설하는 것을 검토 중인데, 이번 건 처리 결과를 보고 결정하려고 합니다.",
    },
  ],
  "grant-mail": [
    {
      title: "창업도약패키지 사업계획서를 지정 양식으로 작성하기",
      role: "지원사업",
      priority: "높음",
      due: { kind: "offset", days: 9 },
      assignee: "미지정",
      source:
        "사업계획서는 반드시 첨부된 지정 양식으로 작성해 주시기 바라며, 증명서류는 발급일 기준 1개월 이내 발급분만 인정됩니다.",
    },
    {
      title: "4대보험 가입자명부와 국세·지방세 완납증명서 발급받기",
      role: "경영지원",
      priority: "중간",
      due: { kind: "offset", days: 8 },
      assignee: "미지정",
      source:
        "제출 서류: 사업계획서(지정 양식), 최근 3개년 재무제표, 4대보험 가입자명부, 국세 및 지방세 완납증명서",
    },
    {
      title: "온라인 사업설명회 사전 참가 신청하기",
      role: "지원사업",
      priority: "중간",
      due: { kind: "offset", days: 2 },
      assignee: "미지정",
      source: (today) =>
        `온라인 사업설명회: ${formatKoreanDate(addDays(today, 3))} 14:00 (사전 신청자에 한해 참여 링크 발송, 신청은 ${formatKoreanDate(addDays(today, 2))}까지)`,
    },
  ],
  "dev-discord": [
    {
      title: "다온컴퍼니 30분 이상 녹음 요약 잘림 이슈 재현하기",
      role: "개발",
      priority: "높음",
      due: { kind: "offset", days: 0 },
      assignee: "박서연",
      source:
        "다만 다온컴퍼니에서 올린 30분 이상 녹음 건은 여전히 요약이 중간에 잘려서 나와요.",
    },
    {
      title: "워커 메모리 증가 원인 프로파일링하기",
      role: "개발",
      priority: "높음",
      due: { kind: "offset", days: 1 },
      assignee: "박서연",
      source:
        "메모리 쪽은 오늘 내로는 못 볼 것 같고 내일 오전에 프로파일링 돌려보겠습니다.",
    },
    {
      title: "결제 웹훅 재시도 로직 구현하기",
      role: "개발",
      priority: "높음",
      due: { kind: "weekday", weekday: 5 },
      assignee: "박서연",
      source:
        "그리고 결제 웹훅 재시도 로직 아직 안 들어갔죠? 이번 주 금요일까지는 넣어주세요.",
    },
    {
      title: "9월 온보딩 이메일 문구 초안 공유하기",
      role: "마케팅",
      priority: "중간",
      due: { kind: "nextWeekMonday" },
      assignee: "이수민",
      source:
        "그리고 다음 주 초까지 9월 온보딩 이메일 문구 초안 공유드릴게요.",
    },
  ],
};

export function presetToTasks(
  id: SampleId,
  today: string = todayISO(),
): ExtractedTask[] {
  return DEMO_PRESETS[id].map((t) => ({
    title: t.title,
    role: t.role,
    priority: t.priority,
    dueDate: resolveDue(t.due, today),
    assignee: t.assignee,
    source: typeof t.source === "function" ? t.source(today) : t.source,
    status: "미처리" as const,
  }));
}
