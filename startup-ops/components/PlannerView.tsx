"use client";

import { MetaBadge, RoleBadge } from "./Badge";
import { daysUntil, ddayLabel, formatDue, weekdayKo } from "@/lib/dates";
import { PRIORITY_ORDER } from "@/lib/roles";
import { UNASSIGNED } from "@/lib/team";
import { Status, Task } from "@/lib/types";

interface Props {
  tasks: Task[];
  today: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStatusChange: (id: string, status: Status) => void;
}

/**
 * 마감이 가까운 순으로 묶는다.
 * 칸반이 "무엇이 어느 직무에 쌓였나"를 보여준다면, 이 화면은
 * "오늘 뭐부터 해야 하나"에 답한다.
 */
const BUCKETS = [
  { key: "overdue", label: "기한 지남", tone: "text-red-700", test: (d: number | null) => d !== null && d < 0 },
  { key: "today", label: "오늘", tone: "text-orange-700", test: (d: number | null) => d === 0 },
  { key: "tomorrow", label: "내일", tone: "text-slate-800", test: (d: number | null) => d === 1 },
  { key: "week", label: "이번 주", tone: "text-slate-800", test: (d: number | null) => d !== null && d >= 2 && d <= 6 },
  { key: "later", label: "그 이후", tone: "text-slate-600", test: (d: number | null) => d !== null && d >= 7 },
  { key: "none", label: "마감 미정", tone: "text-slate-500", test: (d: number | null) => d === null },
] as const;

export default function PlannerView({
  tasks,
  today,
  selectedId,
  onSelect,
  onStatusChange,
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
    <section className="rounded-md border border-slate-200 bg-white">
      <header className="border-b border-slate-200 px-4 py-3">
        <p className="text-[11px] text-slate-400">
          {y}년 {Number(m)}월 {Number(d)}일 {weekdayKo(today)}요일
        </p>
        <h2 className="mt-0.5 text-[15px] font-semibold text-slate-900">오늘의 할일</h2>
        <p className="mt-0.5 text-[12px] text-slate-500">
          메일과 디스코드에서 모인 할일을 마감이 가까운 순으로 정리했습니다.
        </p>
      </header>

      {tasks.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <p className="text-[13px] font-medium text-slate-500">아직 모인 할일이 없습니다</p>
          <p className="mt-1 text-[12px] text-slate-400">
            메일이나 디스코드가 들어오면 여기에 쌓입니다. 지금 확인하려면 인입 탭에서 원문을 넣어보세요.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {BUCKETS.map((bucket) => {
            const items = sorted.filter((t) => bucket.test(daysUntil(t.dueDate, today)));
            if (!items.length) return null;
            return (
              <div key={bucket.key} className="px-4 py-3">
                <div className="mb-2 flex items-baseline gap-2">
                  <h3 className={`text-[12px] font-semibold ${bucket.tone}`}>{bucket.label}</h3>
                  <span className="text-[11px] text-slate-400">
                    {items.filter((t) => t.status !== "완료").length}건
                    {items.some((t) => t.status === "완료") &&
                      ` · 완료 ${items.filter((t) => t.status === "완료").length}`}
                  </span>
                </div>
                <ul className="space-y-1">
                  {items.map((task) => (
                    <Row
                      key={task.id}
                      task={task}
                      today={today}
                      selected={task.id === selectedId}
                      onSelect={onSelect}
                      onStatusChange={onStatusChange}
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
}: {
  task: Task;
  today: string;
  selected: boolean;
  onSelect: (id: string) => void;
  onStatusChange: (id: string, status: Status) => void;
}) {
  const days = daysUntil(task.dueDate, today);
  const done = task.status === "완료";
  const overdue = days !== null && days < 0;
  const urgent = days === 0;

  return (
    <li
      onClick={() => onSelect(task.id)}
      className={`flex cursor-pointer items-start gap-2.5 rounded border px-2.5 py-2 transition
        ${selected ? "border-slate-900 ring-1 ring-slate-900" : "border-transparent hover:border-slate-200 hover:bg-slate-50"}`}
    >
      <input
        type="checkbox"
        checked={done}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onStatusChange(task.id, e.target.checked ? "완료" : "미처리")}
        aria-label={`${task.title} 완료 표시`}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-600"
      />

      <div className="min-w-0 flex-1">
        <p
          className={`text-[13px] font-medium leading-snug ${
            done ? "text-slate-400 line-through" : "text-slate-900"
          }`}
        >
          {task.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <RoleBadge role={task.role} />
          {task.assignee !== UNASSIGNED ? (
            <MetaBadge>{task.assignee}</MetaBadge>
          ) : (
            <MetaBadge tone="warn">담당 미지정</MetaBadge>
          )}
          <span className="text-[11px] text-slate-400">
            {task.channel === "email" ? "메일" : task.channel === "discord" ? "디스코드" : "직접 입력"}
            {task.sourceLabel ? ` · ${truncate(task.sourceLabel, 24)}` : ""}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
            done
              ? "bg-slate-100 text-slate-400"
              : overdue
                ? "bg-red-50 text-red-700"
                : urgent
                  ? "bg-orange-50 text-orange-700"
                  : "bg-slate-100 text-slate-600"
          }`}
        >
          {days === null ? "미정" : ddayLabel(days)}
        </span>
        {days !== null && (
          <span className="text-[10px] text-slate-400">{formatDue(task.dueDate)}</span>
        )}
      </div>
    </li>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
