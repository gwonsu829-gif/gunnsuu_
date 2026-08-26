"use client";

import TaskCard from "./TaskCard";
import { PRIORITY_ORDER } from "@/lib/roles";
import { AssigneeSuggestion } from "@/lib/suggest";
import { Priority, Task } from "@/lib/types";

interface Props {
  tasks: Task[];
  selectedId: string | null;
  today: string;
  onSelect: (id: string) => void;
  onPriorityChange: (id: string, priority: Priority) => void;
  onAssigneeChange: (id: string, assignee: string) => void;
  onClear: () => void;
  suggestions: Map<string, AssigneeSuggestion>;
}

export default function TaskList({
  tasks,
  selectedId,
  today,
  onSelect,
  onPriorityChange,
  onAssigneeChange,
  onClear,
  suggestions,
}: Props) {
  const sorted = [...tasks].sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    const ad = a.dueDate === "미정" ? "9999-99-99" : a.dueDate;
    const bd = b.dueDate === "미정" ? "9999-99-99" : b.dueDate;
    return ad.localeCompare(bd);
  });

  return (
    <section className="flex min-h-0 flex-col rounded-md border border-line bg-surface">
      <header className="flex items-center justify-between border-b border-line px-3 py-2">
        <h2 className="text-[13px] font-semibold text-ink">
          추출된 할일
          <span className="ml-1.5 rounded bg-sunk px-1.5 py-0.5 text-[11px] font-medium text-ink-2">
            {tasks.length}
          </span>
        </h2>
        {tasks.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-ink-4 underline-offset-2 hover:text-ink-2 hover:underline"
          >
            전체 비우기
          </button>
        )}
      </header>

      <div className="thin-scroll min-h-[300px] flex-1 space-y-2 overflow-auto p-3">
        {tasks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 py-10 text-center">
            <p className="text-[13px] font-medium text-ink-3">
              아직 추출된 할일이 없습니다
            </p>
            <p className="text-[12px] text-ink-4">
              왼쪽에 원문을 넣고 &lsquo;AI로 할일 추출하기&rsquo;를 눌러보세요.
            </p>
          </div>
        ) : (
          sorted.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              today={today}
              selected={task.id === selectedId}
              onSelect={onSelect}
              onPriorityChange={onPriorityChange}
              onAssigneeChange={onAssigneeChange}
              suggestion={suggestions.get(task.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}
