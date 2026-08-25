/**
 * 3인 팀 명단. 담당자 지정 드롭다운의 선택지가 된다.
 * 원문에서 유추한 이름이 명단에 없을 수도 있어(예: 고객사 담당자)
 * 그 값도 선택지에 남겨둔다 — options() 참고.
 */
export const TEAM = [
  { name: "김도현", role: "대표" },
  { name: "박서연", role: "개발" },
  { name: "이수민", role: "마케팅·운영" },
] as const;

export const UNASSIGNED = "미지정";

/** 명단 + 미지정 + (명단에 없는) 현재 값 */
export function assigneeOptions(current: string): string[] {
  const base = [UNASSIGNED, ...TEAM.map((m) => m.name)];
  return base.includes(current) ? base : [...base, current];
}

export function teamRoleOf(name: string): string | null {
  return TEAM.find((m) => m.name === name)?.role ?? null;
}
