"use client";

import { useState } from "react";

import AssigneeSuggestionRow from "./AssigneeSuggestion";
import { MetaBadge, RoleBadge } from "./Badge";
import TodaySide from "./TodaySide";
import { clockKST } from "@/lib/activity";
import { daysUntil, formatDue, weekdayKo } from "@/lib/dates";
import { PRIORITY_ORDER } from "@/lib/roles";
import { UNASSIGNED } from "@/lib/team";
import { AssigneeSuggestion } from "@/lib/suggest";
import { Slot, Status, Task } from "@/lib/types";

interface Props {
  tasks: Task[];
  today: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStatusChange: (id: string, status: Status) => void;
  suggestions: Map<string, AssigneeSuggestion>;
  onAssigneeChange: (id: string, assignee: string) => void;
  onSlotChange: (id: string, slot: Slot | null) => void;
  onOpenFlow: () => void;
}

/** 시간을 안 잡은 일에 한 번에 잡아주는 기본 구간 (KST). */
const 기본_시작시 = 14;
const 기본_길이시간 = 2;

function 기본슬롯(today: string): Slot {
  const 시작 = new Date(
    `${today}T${String(기본_시작시).padStart(2, "0")}:00:00+09:00`,
  );
  const 끝 = new Date(시작.getTime() + 기본_길이시간 * 3600_000);
  return { start: 시작.toISOString(), end: 끝.toISOString() };
}

export default function PlannerView({
  tasks,
  today,
  selectedId,
  onSelect,
  onStatusChange,
  suggestions,
  onAssigneeChange,
  onSlotChange,
  onOpenFlow,
}: Props) {
  const [완료펼침, set완료펼침] = useState(false);

  /*
   * 기한이 가까운 순. 완료한 것은 목록에서 빼지 않고 접어 둔다 —
   * 체크하는 순간 사라지면 연속으로 처리할 때 위치가 계속 바뀌어 헷갈리고,
   * "오늘 뭘 했는지"도 화면에서 사라진다.
   */
  const 정렬 = (a: Task, b: Task) => {
    const da = daysUntil(a.dueDate, today);
    const db = daysUntil(b.dueDate, today);
    if (da === null && db === null)
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (da === null) return 1;
    if (db === null) return -1;
    if (da !== db) return da - db;
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  };

  const 남은일 = tasks.filter((t) => t.status !== "완료").sort(정렬);
  const 완료일 = tasks.filter((t) => t.status === "완료").sort(정렬);

  const 오늘남음 = 남은일.filter((t) => {
    const d = daysUntil(t.dueDate, today);
    return d !== null && d <= 0;
  }).length;
  const 담당없음 = 남은일.filter((t) => t.assignee === UNASSIGNED).length;
  const 이번주기한 = 남은일.filter((t) => {
    const d = daysUntil(t.dueDate, today);
    return d !== null && d >= 0 && d <= 6;
  }).length;
  const 기한지남 = 남은일.filter((t) => {
    const d = daysUntil(t.dueDate, today);
    return d !== null && d < 0;
  }).length;

  const [y, m, d] = today.split("-");

  return (
    <div className="flex flex-col gap-3">
      {/*
       * 지표 여섯 칸을 균등하게 늘어놓는 대신 한 문장으로 먼저 말한다.
       * "뭐부터 봐야 할지 모르겠다"는 말이 나온 이유가 여기 있었다 —
       * 같은 크기의 숫자가 여섯 개면 어느 것도 먼저가 아니다.
       */}
      <section className="flex flex-col gap-3 rounded-md border border-line bg-surface px-4 py-3.5 sm:flex-row sm:items-end sm:justify-between sm:gap-7">
        <div className="flex flex-col gap-1.5">
          <span className="num text-[10.5px] text-ink-4">
            {y}년 {Number(m)}월 {Number(d)}일 ({weekdayKo(today)})
          </span>
          <h2 className="text-[14px] font-semibold leading-snug tracking-[-0.01em] text-ink sm:text-[15px]">
            {남은일.length === 0 ? (
              "남은 일이 없습니다."
            ) : (
              <>
                오늘까지인 일 <span className="num">{오늘남음}</span>건, 담당이 안
                정해진 일 <span className="num text-critical">{담당없음}</span>건이
                흐름을 막고 있습니다.
              </>
            )}
          </h2>
        </div>

        <div className="flex items-center">
          {[
            { n: 이번주기한, label: "이번 주 기한", tone: "text-ink" },
            { n: 기한지남, label: "기한 지남", tone: "text-critical" },
            { n: 완료일.length, label: "완료", tone: "text-good" },
          ].map((s, i) => (
            <div
              key={s.label}
              className={`flex flex-col items-end gap-0.5 ${
                i < 2 ? "border-r border-line-soft pr-4" : "pr-0"
              } ${i > 0 ? "pl-4" : ""}`}
            >
              <span
                className={`num text-[17px] font-semibold leading-none ${s.tone}`}
              >
                {s.n}
              </span>
              <span className="whitespace-nowrap text-[10.5px] text-ink-3">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 좁은 화면에서는 한 줄씩, 넓어지면 세 열. */}
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.32fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.32fr)_minmax(0,1fr)_296px]">
        <section className="rounded-md border border-line bg-surface shadow-card">
          <div className="flex items-baseline gap-2 px-4 pb-2.5 pt-3">
            <h2 className="text-[13px] font-semibold text-ink">지금 할 일</h2>
            <span className="text-[11px] text-ink-4">기한 순</span>
            <span className="num ml-auto text-[11px] text-ink-3">
              {남은일.length}건
            </span>
          </div>

          {남은일.length === 0 && 완료일.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <p className="text-[13px] font-medium text-ink-3">
                아직 모인 할일이 없습니다
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-4">
                메일이나 디스코드가 들어오면 여기에 쌓입니다.
              </p>
            </div>
          ) : (
            <ul>
              {남은일.map((task, i) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  today={today}
                  /* 맨 위 한 건만 펼쳐 둔다. 전부 펼치면 우선순위가 다시 사라진다. */
                  강조={i === 0}
                  selected={task.id === selectedId}
                  onSelect={onSelect}
                  onStatusChange={onStatusChange}
                  suggestion={suggestions.get(task.id)}
                  onAssigneeChange={onAssigneeChange}
                  onSlotChange={onSlotChange}
                />
              ))}
              {완료펼침 &&
                완료일.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    today={today}
                    강조={false}
                    selected={task.id === selectedId}
                    onSelect={onSelect}
                    onStatusChange={onStatusChange}
                    suggestion={suggestions.get(task.id)}
                    onAssigneeChange={onAssigneeChange}
                    onSlotChange={onSlotChange}
                  />
                ))}
            </ul>
          )}

          {완료일.length > 0 && (
            <div className="flex items-center justify-between border-t border-line-soft bg-sunk px-4 py-2.5">
              <span className="text-[10.5px] leading-snug text-ink-3">
                완료한 {완료일.length}건은{" "}
                {완료펼침 ? "펼쳐 두었습니다" : "접어 두었습니다"}
              </span>
              <button
                type="button"
                onClick={() => set완료펼침((v) => !v)}
                className="text-[10.5px] text-accent hover:underline"
              >
                {완료펼침 ? "접기" : "펼치기"}
              </button>
            </div>
          )}
        </section>

        <TodaySide
          tasks={tasks}
          today={today}
          suggestions={suggestions}
          onOpenFlow={onOpenFlow}
        />
      </div>
    </div>
  );
}

function TaskRow({
  task,
  today,
  강조,
  selected,
  onSelect,
  onStatusChange,
  suggestion,
  onAssigneeChange,
  onSlotChange,
}: {
  task: Task;
  today: string;
  강조: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  onStatusChange: (id: string, status: Status) => void;
  suggestion?: AssigneeSuggestion;
  onAssigneeChange: (id: string, assignee: string) => void;
  onSlotChange: (id: string, slot: Slot | null) => void;
}) {
  const days = daysUntil(task.dueDate, today);
  const done = task.status === "완료";
  const overdue = !done && days !== null && days < 0;

  const 마감글 =
    days === null
      ? "기한 미정"
      : overdue
        ? `${formatDue(task.dueDate)} 마감 · ${-days}일 지남`
        : days === 0
          ? `${formatDue(task.dueDate)} 마감 · 오늘`
          : `${formatDue(task.dueDate)} 마감 · ${days}일 남음`;

  return (
    <li
      onClick={() => onSelect(task.id)}
      className={`cursor-pointer border-b border-line-soft px-4 py-3 transition last:border-b-0 ${
        selected ? "bg-accent-soft" : "hover:bg-sunk"
      }`}
    >
      <div
        className={`flex flex-col gap-1.5 ${
          강조 ? "border-l-2 border-critical pl-3" : ""
        }`}
      >
        <div className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={done}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) =>
              onStatusChange(task.id, e.target.checked ? "완료" : "미처리")
            }
            aria-label={`${task.title} 완료 표시`}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-good"
          />
          <span
            className={`min-w-0 flex-1 text-[13px] font-medium leading-snug tracking-[-0.01em] sm:text-[13.5px] ${
              done ? "text-ink-4 line-through" : "text-ink"
            }`}
          >
            {task.title}
          </span>
          <span
            className={`num shrink-0 whitespace-nowrap text-[11px] font-medium ${
              overdue ? "text-critical" : done ? "text-ink-4" : "text-ink-3"
            }`}
          >
            {마감글}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pl-6">
          <RoleBadge role={task.role} />
          {task.assignee !== UNASSIGNED ? (
            <MetaBadge>{task.assignee}</MetaBadge>
          ) : suggestion ? (
            <AssigneeSuggestionRow
              compact
              suggestion={suggestion}
              onAccept={(name) => onAssigneeChange(task.id, name)}
            />
          ) : (
            <MetaBadge tone="warn">담당 미지정</MetaBadge>
          )}
          {/* 잡아둔 시간이 있으면 그것부터 보여준다. 없으면 없다고 말한다. */}
          <span className="num text-[11px] text-ink-4">
            {task.slot
              ? `${clockKST(task.slot.start)}–${clockKST(task.slot.end)} 잡힘`
              : "시간 안 잡힘"}
          </span>
        </div>

        {강조 && !done && (
          <div className="flex flex-wrap gap-1.5 pl-6 pt-0.5">
            {task.slot ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSlotChange(task.id, null);
                }}
                className="rounded-md border border-line px-2.5 py-1.5 text-[11px] text-ink-2 hover:bg-sunk"
              >
                시간 비우기
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSlotChange(task.id, 기본슬롯(today));
                }}
                className="rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-medium text-white hover:opacity-90"
              >
                오늘 {기본_시작시}시에 잡기
              </button>
            )}
            {task.status !== "진행중" && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(task.id, "진행중");
                }}
                className="rounded-md border border-line px-2.5 py-1.5 text-[11px] text-ink-2 hover:bg-sunk"
              >
                진행 시작
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
