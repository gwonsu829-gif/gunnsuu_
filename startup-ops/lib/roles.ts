import { Priority, Role, Status } from "./types";

/**
 * Tailwind JIT가 클래스를 정적으로 스캔하므로 문자열을 통째로 적어둔다.
 * (`bg-${color}-50` 같은 동적 조합은 빌드에서 잘려나간다.)
 */
export const ROLE_STYLE: Record<Role, { badge: string; dot: string }> = {
  대표: {
    badge: "bg-sunk text-ink-2 border-line-strong",
    dot: "bg-ink-3",
  },
  CS: {
    badge: "bg-[#eef3f8] text-[#375f80] border-[#d7e3ee]",
    dot: "bg-[#5a86ad]",
  },
  Sales: {
    badge: "bg-[#eff3ea] text-[#4b6236] border-[#dce5cf]",
    dot: "bg-[#788c5d]",
  },
  개발: {
    badge: "bg-[#f0eff7] text-[#414070] border-[#dcdaeb]",
    dot: "bg-[#6b69a8]",
  },
  마케팅: {
    badge: "bg-[#fbf0e9] text-[#8a4b28] border-[#f0dcd0]",
    dot: "bg-[#d97757]",
  },
  CX: {
    badge: "bg-[#fbeef1] text-[#7d3348] border-[#f0d5dc]",
    dot: "bg-[#b05a74]",
  },
  "R&D": {
    badge: "bg-[#f5eef7] text-[#653f76] border-[#e7d7ec]",
    dot: "bg-[#96609f]",
  },
  지원사업: {
    badge: "bg-[#ebf3f2] text-[#2f6360] border-[#d3e5e2]",
    dot: "bg-[#4f918c]",
  },
  경영지원: {
    badge: "bg-[#f6f1ea] text-[#6b4c2c] border-[#e8dcc9]",
    dot: "bg-[#a37a4a]",
  },
};

export const PRIORITY_STYLE: Record<Priority, string> = {
  높음: "bg-critical-soft text-critical border-critical-line",
  중간: "bg-warn-soft text-warn border-warn-line",
  낮음: "bg-sunk text-ink-3 border-line",
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  높음: 0,
  중간: 1,
  낮음: 2,
};

export const STATUS_META: Record<Status, { label: string; accent: string }> = {
  미처리: { label: "미처리", accent: "bg-ink-4" },
  진행중: { label: "진행중", accent: "bg-accent" },
  완료: { label: "완료", accent: "bg-good" },
};
