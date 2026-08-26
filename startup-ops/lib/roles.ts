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
    badge: "bg-[#f0f6f9] text-[#2c556d] border-[#d1e1ea]",
    dot: "bg-[#4187af]",
  },
  Sales: {
    badge: "bg-[#f0f9f5] text-[#2c6d4f] border-[#d1eadf]",
    dot: "bg-[#41af7c]",
  },
  개발: {
    badge: "bg-[#f1f0f9] text-[#322c6d] border-[#d3d1ea]",
    dot: "bg-[#4a41af]",
  },
  마케팅: {
    badge: "bg-[#f9f6f0] text-[#6d532c] border-[#eae0d1]",
    dot: "bg-[#af8341]",
  },
  CX: {
    badge: "bg-[#f9f0f3] text-[#6d2c3e] border-[#ead1d8]",
    dot: "bg-[#af415e]",
  },
  "R&D": {
    badge: "bg-[#f6f0f9] text-[#572c6d] border-[#e2d1ea]",
    dot: "bg-[#8a41af]",
  },
  지원사업: {
    badge: "bg-[#f0f9f9] text-[#2c6d6a] border-[#d1eaea]",
    dot: "bg-[#41afab]",
  },
  경영지원: {
    badge: "bg-[#f9f4f0] text-[#6d442c] border-[#eadad1]",
    dot: "bg-[#af6941]",
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
