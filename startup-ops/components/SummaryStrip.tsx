"use client";

import { isDueToday, isOverdue } from "@/lib/dates";
import { UNASSIGNED } from "@/lib/team";
import { Task } from "@/lib/types";

export default function SummaryStrip({
  tasks,
  today,
}: {
  tasks: Task[];
  today: string;
}) {
  const stats = [
    { label: "총 할일", value: tasks.length, tone: "text-ink" },
    {
      label: "높은 우선순위",
      value: tasks.filter((t) => t.priority === "높음").length,
      tone: "text-critical",
    },
    {
      label: "오늘 마감",
      value: tasks.filter((t) => isDueToday(t.dueDate, today)).length,
      tone: "text-warn",
    },
    {
      label: "기한 지남",
      value: tasks.filter((t) => isOverdue(t.dueDate, today)).length,
      tone: "text-critical",
    },
    {
      label: "담당자 미지정",
      value: tasks.filter((t) => t.assignee === UNASSIGNED).length,
      tone: "text-warn",
    },
    {
      label: "완료",
      value: tasks.filter((t) => t.status === "완료").length,
      tone: "text-good",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-card sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((s) => (
        <div key={s.label} className="bg-surface px-3.5 py-2.5">
          <p className="text-[11px] font-medium text-ink-3">{s.label}</p>
          <p
            className={`num mt-1 text-[21px] font-semibold leading-none tracking-[-0.02em] ${
              s.value === 0 ? "text-ink-4" : s.tone
            }`}
          >
            {s.value}
          </p>
        </div>
      ))}
    </div>
  );
}
