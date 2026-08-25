import { similarity } from "./dedupe";
import { UNASSIGNED } from "./team";
import { Role } from "./types";

export interface AssigneeSuggestion {
  assignee: string;
  /** similar — 비슷한 업무를 그 사람이 맡았음 / role — 그 직무를 그 사람이 도맡고 있음 */
  basis: "similar" | "role";
  /** 화면에 그대로 보여줄 한 줄 */
  reason: string;
  /** 근거가 된 과거 할일 제목 */
  examples: string[];
}

interface HistoryItem {
  id: string;
  title: string;
  role: Role;
  assignee: string;
}

/**
 * "유사 업무"로 볼 최소 유사도.
 * 중복 판정(0.5)보다 낮다 — 같은 건이 아니라 같은 결의 일을 찾는 것이라서.
 * 무관한 쌍은 0.13 이하로 떨어지므로 여유가 있다.
 */
const SIMILAR_THRESHOLD = 0.3;

/** 직무만으로 추천하려면 이만큼은 쌓여야 한다. 한 건은 우연일 수 있다. */
const MIN_ROLE_HISTORY = 2;

/**
 * 과거에 누가 이 결의 일을 맡았는지 보고 담당자를 제안한다.
 *
 * 앰플랩은 "이관이 가능한 유형이 확인되면 위임하고, 이후 유사한 건은
 * 같은 사람에게 이어지도록" 운영한다. 그 패턴을 그대로 옮긴 것이라
 * 자동 배정하지 않고 제안만 한다 — 위임 여부는 사람이 정하는 일이다.
 */
export function suggestAssignee(
  title: string,
  role: Role,
  history: HistoryItem[],
  excludeId?: string,
): AssigneeSuggestion | null {
  const assigned = history.filter(
    (h) => h.assignee !== UNASSIGNED && h.assignee.trim() && h.id !== excludeId,
  );
  if (!assigned.length) return null;

  // 1순위 — 같은 직무 안에서 제목이 닮은 과거 업무.
  // 직무를 넘어 비교하면 고객사 이름 하나로 전혀 다른 일이 묶인다.
  // ("다온컴퍼니 녹음 오류 재현"(개발) vs "다온컴퍼니 플랜 증설 제안"(Sales))
  // 이관은 직무 안에서 일어나므로 같은 직무로 한정하는 것이 맞다.
  const similar = assigned
    .filter((h) => h.role === role)
    .map((h) => ({ item: h, score: similarity(title, h.title) }))
    .filter((x) => x.score >= SIMILAR_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (similar.length) {
    const byPerson = new Map<string, typeof similar>();
    for (const x of similar) {
      const list = byPerson.get(x.item.assignee) ?? [];
      list.push(x);
      byPerson.set(x.item.assignee, list);
    }
    // 건수가 많은 쪽, 같으면 더 닮은 쪽
    const best = Array.from(byPerson.entries()).sort((a, b) => {
      if (a[1].length !== b[1].length) return b[1].length - a[1].length;
      return b[1][0].score - a[1][0].score;
    })[0];

    return {
      assignee: best[0],
      basis: "similar",
      reason: `비슷한 ${role} 업무 ${best[1].length}건을 ${withSubject(best[0])} 맡았습니다`,
      examples: best[1].slice(0, 2).map((x) => x.item.title),
    };
  }

  // 2순위 — 같은 직무를 도맡고 있는 사람
  const sameRole = assigned.filter((h) => h.role === role);
  if (sameRole.length < MIN_ROLE_HISTORY) return null;

  const counts = new Map<string, number>();
  for (const h of sameRole) {
    counts.set(h.assignee, (counts.get(h.assignee) ?? 0) + 1);
  }
  const [person, count] = Array.from(counts.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0];

  // 과반이 아니면 제안하지 않는다. 나눠 맡고 있다는 뜻이라 근거가 약하다.
  if (count * 2 <= sameRole.length) return null;

  return {
    assignee: person,
    basis: "role",
    reason: `${role} 업무 ${sameRole.length}건 중 ${count}건을 ${withSubject(person)} 맡았습니다`,
    examples: sameRole
      .filter((h) => h.assignee === person)
      .slice(0, 2)
      .map((h) => h.title),
  };
}

/** 담당자가 비어 있는 할일마다 제안을 계산한다. */
export function buildSuggestions(
  tasks: HistoryItem[],
): Map<string, AssigneeSuggestion> {
  const out = new Map<string, AssigneeSuggestion>();
  for (const task of tasks) {
    if (task.assignee !== UNASSIGNED) continue;
    const s = suggestAssignee(task.title, task.role, tasks, task.id);
    if (s) out.set(task.id, s);
  }
  return out;
}

/**
 * 받침 유무에 따라 "이/가"를 붙인다.
 * "박서연이" / "이수민이" / "최지우가"
 */
function withSubject(name: string): string {
  const last = name.trim().slice(-1);
  const code = last.charCodeAt(0);
  const isHangul = code >= 0xac00 && code <= 0xd7a3;
  if (!isHangul) return `${name}이`;
  const hasBatchim = (code - 0xac00) % 28 !== 0;
  return `${name}${hasBatchim ? "이" : "가"}`;
}
