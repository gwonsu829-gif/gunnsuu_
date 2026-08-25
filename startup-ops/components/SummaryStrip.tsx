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
    { label: "총 할일", value: tasks.length, tone: "text-slate-900" },
    {
      label: "높은 우선순위",
      value: tasks.filter((t) => t.priority === "높음").length,
      tone: "text-red-600",
    },
    {
      label: "오늘 마감",
      value: tasks.filter((t) => isDueToday(t.dueDate, today)).length,
      tone: "text-orange-600",
    },
    {
      label: "기한 지남",
      value: tasks.filter((t) => isOverdue(t.dueDate, today)).length,
      tone: "text-red-600",
    },
    {
      label: "담당자 미지정",
      value: tasks.filter((t) => t.assignee === UNASSIGNED).length,
      tone: "text-orange-600",
    },
    {
      label: "완료",
      value: tasks.filter((t) => t.status === "완료").length,
      tone: "text-emerald-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((s) => (
        <div key={s.label} className="bg-white px-3 py-2">
          <p className="text-[11px] text-slate-500">{s.label}</p>
          <p className={`mt-0.5 text-lg font-semibold leading-none ${s.tone}`}>
            {s.value}
          </p>
        </div>
      ))}
    </div>
  );
}
