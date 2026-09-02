"use client";

import { createContext, useContext } from "react";

import { DEFAULT_SETTINGS } from "@/lib/settings";
import { TeamMember } from "@/lib/types";

/**
 * 팀 명단을 트리 아래로 내려보낸다.
 * 담당자 드롭다운이 있는 카드가 여섯 종류라 prop으로 내리면 전부 손대야 한다.
 */
const TeamContext = createContext<TeamMember[]>(DEFAULT_SETTINGS.team);

export const TeamProvider = TeamContext.Provider;

export function useTeam(): TeamMember[] {
  return useContext(TeamContext);
}

export function memberColor(team: TeamMember[], name: string): string {
  return team.find((m) => m.name === name)?.color ?? "#9b9ba3";
}
