import { TeamMember } from "./types";

/**
 * 팀 명단은 설정(저장소)에 있다. 여기는 기본값과 도우미만.
 * 담당자 드롭다운은 설정의 명단 + 미지정 + (명단에 없는) 현재 값이다 —
 * 원문에서 유추한 이름(고객사 담당자 등)이 명단에 없어도 선택지에서 사라지면 안 된다.
 */
export const UNASSIGNED = "미지정";

export function assigneeOptions(current: string, team: TeamMember[]): string[] {
  const base = [UNASSIGNED, ...team.map((m) => m.name)];
  return base.includes(current) ? base : [...base, current];
}

export function teamRoleOf(name: string, team: TeamMember[]): string | null {
  return team.find((m) => m.name === name)?.role ?? null;
}

/** 아바타에 넣을 글자. 한글 이름은 마지막 두 글자보다 첫 글자가 더 잘 읽힌다. */
export function initial(name: string): string {
  const s = name.trim();
  if (!s) return "?";
  return /^[a-z]/i.test(s) ? s.slice(0, 2).toUpperCase() : s.slice(0, 1);
}
