import { KeywordRule, MailLabel, Settings, TeamMember } from "./types";
import { ROLES } from "./types";

/**
 * 화면에서 고치는 설정. 저장소에 한 벌만 있고 세 사람이 공유한다.
 *
 * 환경변수로 두지 않는 이유: 팀 명단이나 키워드는 대표님이 화면에서
 * 바로 바꿔야 하는 값이다. 바꿀 때마다 재배포하게 만들면 결국 안 바꾼다.
 */

export const MAIL_LABELS: readonly MailLabel[] = [...ROLES, "참고"];

/** 아바타 색. 이름이 아니라 순서로 정해져 세 사람이 늘 같은 색을 갖는다. */
export const MEMBER_COLORS = ["#5b5bd6", "#1f9d6a", "#d9772f", "#c2417c", "#2f7fc1"];

export const DEFAULT_SETTINGS: Settings = {
  companyName: "앰플랩",
  team: [
    { name: "대표", role: "대표 · 영업 · 지원사업", color: MEMBER_COLORS[0] },
    { name: "개발", role: "개발 · R&D", color: MEMBER_COLORS[1] },
    { name: "운영", role: "CS · 마케팅 · 경영지원", color: MEMBER_COLORS[2] },
  ],
  /*
   * 규칙은 "이 단어가 보이면 무조건 이 라벨"이다. AI 판단보다 우선한다.
   * 처음 값은 앰플랩이 실제로 받는 메일 종류를 기준으로 채웠다.
   */
  keywordRules: [
    { label: "지원사업", keywords: ["지원사업", "공고", "선정", "협약", "사업계획서", "창업진흥원", "테크노파크"] },
    { label: "CS", keywords: ["문의", "오류", "장애", "안 됩니다", "안됩니다", "불편", "환불"] },
    { label: "Sales", keywords: ["견적", "제안서", "계약", "도입", "플랜", "구독"] },
    { label: "경영지원", keywords: ["세금계산서", "국민연금", "건강보험", "4대보험", "원천세", "급여", "법인"] },
    { label: "개발", keywords: ["배포", "API", "버그", "서버", "GitHub", "PR"] },
    { label: "참고", keywords: ["뉴스레터", "newsletter", "수신거부", "unsubscribe", "광고"] },
  ],
  mailQuery: "newer_than:7d -category:promotions -category:social -in:spam -in:trash",
  labelPrefix: "업무",
};

const MAX_TEAM = 8;
const MAX_RULES = 40;
const MAX_KEYWORDS_PER_RULE = 30;

function cleanString(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function isLabel(v: unknown): v is MailLabel {
  return typeof v === "string" && (MAIL_LABELS as readonly string[]).includes(v);
}

/** 화면에서 온 값을 그대로 믿지 않는다. 모양이 틀린 부분은 기본값으로 메운다. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

  const team: TeamMember[] = [];
  if (Array.isArray(r.team)) {
    for (const [i, m] of r.team.slice(0, MAX_TEAM).entries()) {
      const mm = (typeof m === "object" && m !== null ? m : {}) as Record<string, unknown>;
      const name = cleanString(mm.name, 20);
      if (!name) continue;
      // 같은 이름이 두 번 있으면 담당자 드롭다운이 갈라진다.
      if (team.some((t) => t.name === name)) continue;
      const color = /^#[0-9a-f]{6}$/i.test(String(mm.color ?? ""))
        ? String(mm.color)
        : MEMBER_COLORS[i % MEMBER_COLORS.length];
      team.push({ name, role: cleanString(mm.role, 40), color });
    }
  }

  const keywordRules: KeywordRule[] = [];
  if (Array.isArray(r.keywordRules)) {
    for (const rule of r.keywordRules.slice(0, MAX_RULES)) {
      const rr = (typeof rule === "object" && rule !== null ? rule : {}) as Record<string, unknown>;
      if (!isLabel(rr.label)) continue;
      const keywords = Array.isArray(rr.keywords)
        ? rr.keywords
            .map((k) => cleanString(k, 40))
            .filter(Boolean)
            .slice(0, MAX_KEYWORDS_PER_RULE)
        : [];
      if (!keywords.length) continue;
      keywordRules.push({ label: rr.label, keywords: Array.from(new Set(keywords)) });
    }
  }

  return {
    companyName: cleanString(r.companyName, 30) || DEFAULT_SETTINGS.companyName,
    team: team.length ? team : DEFAULT_SETTINGS.team,
    keywordRules,
    mailQuery: cleanString(r.mailQuery, 300) || DEFAULT_SETTINGS.mailQuery,
    labelPrefix: cleanString(r.labelPrefix, 20).replace(/\//g, "") || DEFAULT_SETTINGS.labelPrefix,
  };
}

/**
 * 키워드 규칙을 제목·본문에 적용한다. 대소문자는 무시하고, 공백은 없앤 뒤 비교한다 —
 * "안 됩니다"와 "안됩니다"를 따로 등록하게 만들면 결국 하나를 빠뜨린다.
 */
export function applyKeywordRules(
  rules: KeywordRule[],
  subject: string,
  body: string,
): MailLabel[] {
  const hay = `${subject}\n${body}`.toLowerCase().replace(/\s+/g, "");
  const hit: MailLabel[] = [];
  for (const rule of rules) {
    const matched = rule.keywords.some((k) => {
      const needle = k.toLowerCase().replace(/\s+/g, "");
      return needle.length > 0 && hay.includes(needle);
    });
    if (matched && !hit.includes(rule.label)) hit.push(rule.label);
  }
  return hit;
}

/** "업무/CS" 처럼 Gmail에 실제로 붙는 라벨 이름 */
export function gmailLabelName(prefix: string, label: MailLabel): string {
  return `${prefix}/${label}`;
}
