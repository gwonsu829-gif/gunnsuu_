"use client";

import { formatDue, daysUntil, ddayLabel } from "@/lib/dates";
import { ROLE_STYLE } from "@/lib/roles";
import {
  Stage,
  buildStages,
  countByStage,
  formatStageTime,
} from "@/lib/stages";
import { AssigneeSuggestion } from "@/lib/suggest";
import { Task } from "@/lib/types";

/**
 * 할일 하나가 어디까지 왔고 어디서 멈췄는지 보여주는 화면.
 *
 * 칸반은 "무엇이 미처리인가"에 답하지만 "왜 아직 미처리인가"에는 답하지 못한다.
 * 담당자가 없어서인지, 지정은 됐는데 시작을 안 한 것인지가 같은 칸에 섞인다.
 * 여기서는 그 둘이 다른 칸에 선다.
 */
export default function StageView({
  tasks,
  today,
  suggestions,
  selectedId,
  onSelect,
}: {
  tasks: Task[];
  today: string;
  suggestions: Map<string, AssigneeSuggestion>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!tasks.length) {
    return (
      <p className="rounded border border-dashed border-line px-4 py-10 text-center text-[13px] text-ink-4">
        아직 들어온 할일이 없습니다.
      </p>
    );
  }

  const rows = tasks.map((task) => ({
    task,
    stages: buildStages(task, suggestions.get(task.id)),
  }));
  const funnel = countByStage(rows.map((r) => r.stages));

  // 멈춘 자리가 뒤일수록 앞에 세운다. 끝난 것은 맨 뒤로.
  const ordered = rows.slice().sort((a, b) => {
    const done = (r: typeof a) => (r.task.status === "완료" ? 1 : 0);
    if (done(a) !== done(b)) return done(a) - done(b);
    const at = (r: typeof a) => r.stages.findIndex((s) => s.current);
    return at(a) - at(b);
  });

  return (
    <div className="space-y-3">
      {/* 어느 칸에 몇 건이 멈춰 있는지 — 쌓이는 자리가 병목이다 */}
      <div className="rounded border border-line bg-surface p-3">
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-ink">단계별 현황</h2>
          <p className="text-[11px] text-ink-4">
            건수가 쌓이는 칸이 지금의 병목입니다
          </p>
        </div>
        <ol className="flex flex-wrap items-stretch gap-1.5">
          {funnel.map((f, i) => (
            <li key={f.key} className="flex min-w-[92px] flex-1 items-center gap-1.5">
              <div
                className={`flex-1 rounded border px-2 py-1.5 ${
                  f.머무름 > 0
                    ? "border-accent-line bg-accent-soft"
                    : "border-line bg-sunk"
                }`}
              >
                <div className="text-[10.5px] text-ink-4">{f.key}</div>
                <div className="flex items-baseline gap-1">
                  <span
                    className={`num text-[15px] font-semibold ${
                      f.머무름 > 0 ? "text-accent" : "text-ink-3"
                    }`}
                  >
                    {f.머무름}
                  </span>
                  <span className="text-[10px] text-ink-4">
                    대기 · 통과 {f.통과}
                  </span>
                </div>
              </div>
              {i < funnel.length - 1 && (
                <span aria-hidden className="text-[11px] text-line-strong">
                  ›
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>

      <ul className="space-y-2">
        {ordered.map(({ task, stages }) => (
          <li key={task.id}>
            <TaskTrack
              task={task}
              stages={stages}
              today={today}
              open={selectedId === task.id}
              onSelect={() => onSelect(task.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TaskTrack({
  task,
  stages,
  today,
  open,
  onSelect,
}: {
  task: Task;
  stages: Stage[];
  today: string;
  open: boolean;
  onSelect: () => void;
}) {
  const 남은날 = daysUntil(task.dueDate, today);
  const 지남 = 남은날 !== null && 남은날 < 0 && task.status !== "완료";
  const 멈춘칸 = stages.find((s) => s.current);
  const style = ROLE_STYLE[task.role];

  return (
    <div
      className={`rounded border bg-surface transition ${
        open ? "border-accent" : "border-line hover:border-line-strong"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-expanded={open}
        className="w-full px-3 py-2.5 text-left"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`rounded border px-1.5 py-0.5 text-[10.5px] ${style.badge}`}>
            {task.role}
          </span>
          <span
            className={`flex-1 text-[13px] font-medium ${
              task.status === "완료" ? "text-ink-4 line-through" : "text-ink"
            }`}
          >
            {task.title}
          </span>
          {남은날 !== null && (
            <span
              className={`num rounded px-1.5 py-0.5 text-[11px] ${
                지남
                  ? "bg-critical-soft text-critical"
                  : "bg-sunk text-ink-3"
              }`}
            >
              {ddayLabel(남은날)} · {formatDue(task.dueDate)}
            </span>
          )}
        </div>

        <ol className="mt-2.5 flex items-center">
          {stages.map((s, i) => (
            <li key={s.key} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <span
                  aria-hidden
                  className={`flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-bold ${
                    s.current
                      ? "border-accent bg-accent text-white"
                      : s.done
                        ? "border-good bg-good text-white"
                        : "border-line-strong bg-surface text-ink-4"
                  }`}
                >
                  {s.done ? "✓" : s.current ? "·" : ""}
                </span>
                <span
                  className={`whitespace-nowrap text-[10px] ${
                    s.current
                      ? "font-semibold text-accent"
                      : s.done
                        ? "text-ink-3"
                        : "text-ink-4"
                  }`}
                >
                  {s.key}
                </span>
              </div>
              {i < stages.length - 1 && (
                <span
                  aria-hidden
                  className={`mx-1 mb-4 h-px flex-1 ${
                    stages[i + 1].done ? "bg-good" : "bg-line"
                  }`}
                />
              )}
            </li>
          ))}
        </ol>

        {멈춘칸 && (
          <p className="mt-1.5 text-[11px] text-ink-3">
            <span className="font-medium text-accent">{멈춘칸.key}</span>
            {멈춘칸.detail ? ` — ${멈춘칸.detail}` : "에서 대기 중"}
          </p>
        )}
      </button>

      {open && (
        <dl className="divide-y divide-line-soft border-t border-line px-3 text-[11.5px]">
          {stages.map((s) => (
            <div key={s.key} className="flex gap-2 py-1.5">
              <dt
                className={`w-11 shrink-0 ${
                  s.done ? "text-ink-2" : "text-ink-4"
                }`}
              >
                {s.key}
              </dt>
              <dd className="flex-1 text-ink-3">
                {s.detail ?? (s.done ? "완료" : "—")}
              </dd>
              <dd className="num w-20 shrink-0 text-right text-ink-4">
                {formatStageTime(s.at) || "기록 없음"}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
