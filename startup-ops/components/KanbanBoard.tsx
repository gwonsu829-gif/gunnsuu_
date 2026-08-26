"use client";

import { useState } from "react";

import { MetaBadge, PriorityBadge } from "./Badge";
import { formatDue, isDueToday, isOverdue } from "@/lib/dates";
import { ROLE_STYLE, STATUS_META } from "@/lib/roles";
import { ROLES, Role, STATUSES, Status, Task } from "@/lib/types";

interface Props {
  tasks: Task[];
  today: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, role: Role, status: Status) => void;
}

export default function KanbanBoard({
  tasks,
  today,
  selectedId,
  onSelect,
  onMove,
}: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // 할일이 하나라도 있는 직무만 레인으로 세운다.
  const activeRoles = ROLES.filter((role) => tasks.some((t) => t.role === role));

  if (tasks.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line-strong bg-surface px-3 py-10 text-center text-[12px] text-ink-4">
        할일을 추출하면 직무별 칸반이 여기에 나타납니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activeRoles.map((role) => {
        const laneTasks = tasks.filter((t) => t.role === role);
        return (
          <div
            key={role}
            className="overflow-hidden rounded-md border border-line bg-surface"
          >
            <div className="flex items-center gap-2 border-b border-line bg-sunk px-3 py-1.5">
              <span className={`h-2 w-2 rounded-full ${ROLE_STYLE[role].dot}`} />
              <span className="text-[12px] font-semibold text-ink">
                {role}
              </span>
              <span className="text-[11px] text-ink-4">
                {laneTasks.length}건
              </span>
            </div>

            <div className="grid grid-cols-3 gap-px bg-line">
              {STATUSES.map((status) => {
                const cellKey = `${role}:${status}`;
                const cellTasks = laneTasks.filter((t) => t.status === status);
                return (
                  <div
                    key={status}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setHovered(cellKey);
                    }}
                    onDragLeave={() =>
                      setHovered((h) => (h === cellKey ? null : h))
                    }
                    onDrop={(e) => {
                      e.preventDefault();
                      const id =
                        e.dataTransfer.getData("text/plain") || draggingId;
                      if (id) onMove(id, role, status);
                      setHovered(null);
                      setDraggingId(null);
                    }}
                    className={`min-h-[92px] p-2 transition-colors ${
                      hovered === cellKey ? "bg-sunk" : "bg-surface"
                    }`}
                  >
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${STATUS_META[status].accent}`}
                      />
                      <span className="text-[11px] font-medium text-ink-3">
                        {STATUS_META[status].label}
                      </span>
                      <span className="text-[11px] text-ink-4">
                        {cellTasks.length}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {cellTasks.map((task) => {
                        const overdue = isOverdue(task.dueDate, today);
                        const dueToday = isDueToday(task.dueDate, today);
                        return (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", task.id);
                              e.dataTransfer.effectAllowed = "move";
                              setDraggingId(task.id);
                            }}
                            onDragEnd={() => {
                              setDraggingId(null);
                              setHovered(null);
                            }}
                            onClick={() => onSelect(task.id)}
                            className={`cursor-grab rounded border bg-surface p-2 shadow-card active:cursor-grabbing
                              ${
                                selectedId === task.id
                                  ? "border-accent ring-1 ring-accent"
                                  : "border-line hover:border-ink-4"
                              }
                              ${draggingId === task.id ? "opacity-40" : ""}
                              ${status === "완료" ? "opacity-70" : ""}`}
                          >
                            <p
                              className={`text-[12px] font-medium leading-snug text-ink ${
                                status === "완료" ? "line-through" : ""
                              }`}
                            >
                              {task.title}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              <PriorityBadge priority={task.priority} />
                              <MetaBadge
                                tone={
                                  overdue
                                    ? "danger"
                                    : dueToday
                                      ? "warn"
                                      : "default"
                                }
                              >
                                {task.dueDate === "미정"
                                  ? "미정"
                                  : formatDue(task.dueDate)}
                              </MetaBadge>
                              <MetaBadge>{task.assignee}</MetaBadge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
