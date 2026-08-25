"use client";

import AssigneeSuggestionRow from "./AssigneeSuggestion";
import BadgeSelect from "./BadgeSelect";
import { MetaBadge, RoleBadge } from "./Badge";
import { formatDue, isDueToday, isOverdue } from "@/lib/dates";
import { PRIORITY_STYLE } from "@/lib/roles";
import { UNASSIGNED, assigneeOptions, teamRoleOf } from "@/lib/team";
import { AssigneeSuggestion } from "@/lib/suggest";
import { PRIORITIES, Priority, Task } from "@/lib/types";

interface Props {
  task: Task;
  selected: boolean;
  today: string;
  onSelect: (id: string) => void;
  onPriorityChange: (id: string, priority: Priority) => void;
  onAssigneeChange: (id: string, assignee: string) => void;
  suggestion?: AssigneeSuggestion;
}

export default function TaskCard({
  task,
  selected,
  today,
  onSelect,
  onPriorityChange,
  onAssigneeChange,
  suggestion,
}: Props) {
  const overdue = isOverdue(task.dueDate, today);
  const dueToday = isDueToday(task.dueDate, today);
  const unassigned = task.assignee === UNASSIGNED;
  const teamRole = teamRoleOf(task.assignee);

  return (
    <div
      onClick={() => onSelect(task.id)}
      className={`rounded-md border bg-white p-3 shadow-card transition
        ${
          selected
            ? "border-slate-900 ring-1 ring-slate-900"
            : "border-slate-200 hover:border-slate-400"
        }`}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(task.id);
          }}
          aria-pressed={selected}
          className="flex-1 text-left text-[13px] font-semibold leading-snug text-slate-900"
        >
          {task.title}
        </button>
        {task.duplicateOf && (
          <span className="shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium leading-none text-slate-600">
            중복 의심
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <RoleBadge role={task.role} />

        <BadgeSelect
          value={task.priority}
          options={[...PRIORITIES]}
          onChange={(v) => onPriorityChange(task.id, v as Priority)}
          className={PRIORITY_STYLE[task.priority]}
          title="우선순위 변경"
        />

        <MetaBadge tone={overdue ? "danger" : dueToday ? "warn" : "default"}>
          {task.dueDate === "미정"
            ? "마감 미정"
            : `${formatDue(task.dueDate)}${overdue ? " 지남" : dueToday ? " 오늘" : ""}`}
        </MetaBadge>

        <BadgeSelect
          value={task.assignee}
          options={assigneeOptions(task.assignee)}
          onChange={(v) => onAssigneeChange(task.id, v)}
          className={
            unassigned
              ? "border-orange-200 bg-orange-50 text-orange-700"
              : "border-slate-200 bg-white text-slate-600"
          }
          title={teamRole ? `담당자 변경 (${task.assignee} · ${teamRole})` : "담당자 지정"}
        />
      </div>

      {suggestion && (
        <AssigneeSuggestionRow
          suggestion={suggestion}
          onAccept={(name) => onAssigneeChange(task.id, name)}
        />
      )}

      {task.source && (
        <p className="mt-2 flex flex-wrap items-baseline gap-1 border-t border-dashed border-slate-200 pt-2 text-[11px] leading-relaxed text-slate-500">
          <span className={`rounded border px-1 py-px text-[10px] font-medium ${CHANNEL_STYLE[task.channel].badge}`}>
            {CHANNEL_STYLE[task.channel].label}
          </span>
          <span>
            {task.sourceLabel} — “{truncate(task.source, 62)}”
          </span>
        </p>
      )}
    </div>
  );
}

/** 자동 수집분과 직접 붙여넣은 것을 한눈에 구분한다. */
const CHANNEL_STYLE: Record<Task["channel"], { label: string; badge: string }> = {
  manual: { label: "직접 입력", badge: "border-slate-200 bg-slate-50 text-slate-500" },
  email: { label: "메일", badge: "border-sky-200 bg-sky-50 text-sky-700" },
  discord: { label: "디스코드", badge: "border-indigo-200 bg-indigo-50 text-indigo-700" },
};

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
