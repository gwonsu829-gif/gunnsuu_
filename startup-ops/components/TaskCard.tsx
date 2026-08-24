"use client";

import { MetaBadge, PriorityBadge, RoleBadge } from "./Badge";
import { formatDue, isDueToday, isOverdue } from "@/lib/dates";
import { Task } from "@/lib/types";

interface Props {
  task: Task;
  selected: boolean;
  today: string;
  onSelect: (id: string) => void;
}

export default function TaskCard({ task, selected, today, onSelect }: Props) {
  const overdue = isOverdue(task.dueDate, today);
  const dueToday = isDueToday(task.dueDate, today);

  return (
    <button
      type="button"
      onClick={() => onSelect(task.id)}
      aria-pressed={selected}
      className={`w-full rounded-md border bg-white p-3 text-left shadow-card transition
        ${
          selected
            ? "border-slate-900 ring-1 ring-slate-900"
            : "border-slate-200 hover:border-slate-400"
        }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold leading-snug text-slate-900">
          {task.title}
        </p>
        {task.duplicateOf && (
          <span className="shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium leading-none text-slate-600">
            중복 의심
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <RoleBadge role={task.role} />
        <PriorityBadge priority={task.priority} />
        <MetaBadge tone={overdue ? "danger" : dueToday ? "warn" : "default"}>
          {task.dueDate === "미정"
            ? "마감 미정"
            : `${formatDue(task.dueDate)}${overdue ? " 지남" : dueToday ? " 오늘" : ""}`}
        </MetaBadge>
        <MetaBadge>{task.assignee}</MetaBadge>
      </div>

      {task.source && (
        <p className="mt-2 border-t border-dashed border-slate-200 pt-2 text-[11px] leading-relaxed text-slate-500">
          <span className="font-medium text-slate-600">출처</span> ·{" "}
          {task.sourceLabel} — “{truncate(task.source, 70)}”
        </p>
      )}
    </button>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
