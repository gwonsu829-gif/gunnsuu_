import { Priority, Role, Status } from "./types";

/**
 * Tailwind JIT가 클래스를 정적으로 스캔하므로 문자열을 통째로 적어둔다.
 * (`bg-${color}-50` 같은 동적 조합은 빌드에서 잘려나간다.)
 */
export const ROLE_STYLE: Record<Role, { badge: string; dot: string }> = {
  대표: {
    badge: "bg-slate-100 text-slate-700 border-slate-300",
    dot: "bg-slate-500",
  },
  CS: {
    badge: "bg-sky-50 text-sky-700 border-sky-200",
    dot: "bg-sky-500",
  },
  Sales: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  개발: {
    badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
    dot: "bg-indigo-500",
  },
  마케팅: {
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  CX: {
    badge: "bg-rose-50 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
  },
  "R&D": {
    badge: "bg-violet-50 text-violet-700 border-violet-200",
    dot: "bg-violet-500",
  },
  지원사업: {
    badge: "bg-teal-50 text-teal-700 border-teal-200",
    dot: "bg-teal-500",
  },
  경영지원: {
    badge: "bg-stone-100 text-stone-700 border-stone-300",
    dot: "bg-stone-500",
  },
};

export const PRIORITY_STYLE: Record<Priority, string> = {
  높음: "bg-red-50 text-red-700 border-red-200",
  중간: "bg-amber-50 text-amber-700 border-amber-200",
  낮음: "bg-slate-50 text-slate-500 border-slate-200",
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  높음: 0,
  중간: 1,
  낮음: 2,
};

export const STATUS_META: Record<Status, { label: string; accent: string }> = {
  미처리: { label: "미처리", accent: "bg-slate-400" },
  진행중: { label: "진행중", accent: "bg-blue-500" },
  완료: { label: "완료", accent: "bg-emerald-500" },
};
