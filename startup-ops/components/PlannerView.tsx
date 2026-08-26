"use client";

import AssigneeSuggestionRow from "./AssigneeSuggestion";
import { MetaBadge, RoleBadge } from "./Badge";
import { daysUntil, ddayLabel, formatDue, weekdayKo } from "@/lib/dates";
import { PRIORITY_ORDER } from "@/lib/roles";
import { UNASSIGNED } from "@/lib/team";
import { AssigneeSuggestion } from "@/lib/suggest";
import { Status, Task } from "@/lib/types";

interface Props {
  tasks: Task[];
  today: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStatusChange: (id: string, status: Status) => void;
  suggestions: Map<string, AssigneeSuggestion>;
  onAssigneeChange: (id: string, assignee: string) => void;
}

/**
 * 마감이 가까운 순으로 묶는다.
 * 칸반이 "무엇이 어느 직무에 쌓였나"를 보여준다면, 이 화면은
 * "오늘 뭐부터 해야 하나"에 답한다.
 */
const BUCKETS = [
  { key: "overdue", label: "기한 지남", tone: "text-critical", marker: "bg-critical", test: (d: number | null) => d !== null && d < 0 },
  { key: "today", label: "오늘", tone: "text-warn", marker: "bg-warn", test: (d: number | null) => d === 0 },
  { key: "tomorrow", label: "내일", tone: "text-ink", marker: "bg-ink-3", test: (d: number | null) => d === 1 },
  { key: "week", label: "이번 주", tone: "text-ink-2", marker: "bg-ink-4", test: (d: number | null) => d !== null && d >= 2 && d <= 6 },
  { key: "later", label: "그 이후", tone: "text-ink-3", marker: "bg-line-strong", test: (d: number | null) => d !== null && d >= 7 },
  { key: "none", label: "마감 미정", tone: "text-ink-3", marker: "bg-line-strong", test: (d: number | null) => d === null },
] as const;

export default function PlannerView({
  tasks,
  today,
  selectedId,
  onSelect,
  onStatusChange,
  suggestions,
  onAssigneeChange,
}: Props) {
  /**
   * 완료한 항목을 목록에서 빼지 않고 제자리에 취소선으로 남긴다.
   * 체크하는 순간 사라지면 연속으로 처리할 때 위치가 계속 바뀌어 헷갈리고,
   * "오늘 뭘 했는지"도 화면에서 사라진다.
   */
  const sorted = [...tasks].sort((a, b) => {
    const da = daysUntil(a.dueDate, today);
    const db = daysUntil(b.dueDate, today);
    // 마감 미정은 항상 뒤로
    if (da === null && db === null) return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (da === null) return 1;
    if (db === null) return -1;
    if (da !== db) return da - db;
    // 같은 마감 안에서는 완료한 것을 아래로
    const ca = a.status === "완료" ? 1 : 0;
    const cb = b.status === "완료" ? 1 : 0;
    if (ca !== cb) return ca - cb;
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });

  const [y, m, d] = today.split("-");

  return (
    <section className="rounded-md border border-line bg-surface">
      <header className="border-b border-line px-4 py-3">
        <p className="text-[11px] text-ink-4">
          {y}년 {Number(m)}월 {Number(d)}일 {weekdayKo(today)}요일
        </p>
        <h2 className="mt-0.5 text-[15px] font-semibold text-ink">오늘의 할일</h2>
        <p className="mt-0.5 text-[12px] text-ink-3">
          메일과 디스코드에서 모인 할일을 마감이 가까운 순으로 정리했습니다.
        </p>
      </header>

      {tasks.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <p className="text-[13px] font-medium text-ink-3">아직 모인 할일이 없습니다</p>
          <p className="mt-1 text-[12px] text-ink-4">
            메일이나 디스코드가 들어오면 여기에 쌓입니다. 지금 확인하려면 인입 탭에서 원문을 넣어보세요.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-line-soft">
          {BUCKETS.map((bucket) => {
            const items = sorted.filter((t) => bucket.test(daysUntil(t.dueDate, today)));
            if (!items.length) return null;
            return (
              <div key={bucket.key} className="px-4 py-3.5">
                <div className="mb-2 flex items-center gap-2">
                  <span className={`h-3 w-[3px] rounded-full ${bucket.marker}`} />
                  <h3 className={`text-[12px] font-semibold ${bucket.tone}`}>{bucket.label}</h3>
                  <span className="text-[11px] text-ink-4">
                    {items.filter((t) => t.status !== "완료").length}건
                    {items.some((t) => t.status === "완료") &&
                      ` · 완료 ${items.filter((t) => t.status === "완료").length}`}
                  </span>
                </div>
                <ul className="divide-y divide-line-soft">
                  {items.map((task) => (
                    <Row
                      key={task.id}
                      task={task}
                      today={today}
                      selected={task.id === selectedId}
                      onSelect={onSelect}
                      onStatusChange={onStatusChange}
                      suggestion={suggestions.get(task.id)}
                      onAssigneeChange={onAssigneeChange}
                    />
                  ))}
                </ul>
              </div>
            );
          })}

        </div>
      )}
    </section>
  );
}

function Row({
  task,
  today,
  selected,
  onSelect,
  onStatusChange,
  suggestion,
  onAssigneeChange,
}: {
  task: Task;
  today: string;
  selected: boolean;
  onSelect: (id: string) => void;
  onStatusChange: (id: string, status: Status) => void;
  suggestion?: AssigneeSuggestion;
  onAssigneeChange: (id: string, assignee: string) => void;
}) {
  const days = daysUntil(task.dueDate, today);
  const done = task.status === "완료";
  const overdue = days !== null && days < 0;
  const urgent = days === 0;

  return (
    <li
      onClick={() => onSelect(task.id)}
      className={`flex cursor-pointer items-start gap-3 px-2 py-2.5 transition
        ${selected ? "bg-accent-soft" : "hover:bg-sunk"}`}
    >
      <input
        type="checkbox"
        checked={done}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onStatusChange(task.id, e.target.checked ? "완료" : "미처리")}
        aria-label={`${task.title} 완료 표시`}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-good"
      />

      <div className="min-w-0 flex-1">
        <p
          className={`text-[13px] font-medium leading-snug ${
            done ? "text-ink-4 line-through" : "text-ink"
          }`}
        >
          {task.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
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
          <span className="text-[11px] text-ink-4">
            {task.channel === "email" ? "메일" : task.channel === "discord" ? "디스코드" : "직접 입력"}
            {task.sourceLabel ? ` · ${truncate(task.sourceLabel, 24)}` : ""}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span
          className={`num rounded border px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
            done
              ? "border-line bg-sunk text-ink-4"
              : overdue
                ? "border-critical-line bg-critical-soft text-critical"
                : urgent
                  ? "border-warn-line bg-warn-soft text-warn"
                  : "border-line bg-surface text-ink-2"
          }`}
        >
          {days === null ? "미정" : ddayLabel(days)}
        </span>
        {days !== null && (
          <span className="num text-[10px] text-ink-4">{formatDue(task.dueDate)}</span>
        )}
      </div>
    </li>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
