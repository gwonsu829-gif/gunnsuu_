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
      <p className="rounded-lg border border-dashed border-line bg-surface px-4 py-12 text-center text-[13px] text-ink-4">
        아직 들어온 할일이 없습니다.
      </p>
    );
  }

  const rows = tasks.map((task) => ({
    task,
    stages: buildStages(task, suggestions.get(task.id)),
  }));
  const funnel = countByStage(rows.map((r) => r.stages));

  const ordered = rows.slice().sort((a, b) => {
    const done = (r: typeof a) => (r.task.status === "완료" ? 1 : 0);
    if (done(a) !== done(b)) return done(a) - done(b);
    const at = (r: typeof a) => r.stages.findIndex((s) => s.current);
    return at(a) - at(b);
  });

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line-soft px-5 py-4">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
              WORK FLOW
            </p>
            <h2 className="text-[16px] font-semibold text-ink">전체 업무 진행 현황</h2>
            <p className="mt-1 text-[12px] text-ink-4">
              배송조회처럼 각 업무가 어느 단계에서 멈췄는지 한눈에 확인합니다.
            </p>
          </div>
          <p className="rounded-full bg-sunk px-3 py-1.5 text-[11px] text-ink-3">
            숫자가 큰 단계일수록 현재 병목 가능성이 높습니다
          </p>
        </div>

        <div className="overflow-x-auto px-5 py-5 thin-scroll">
          <ol className="flex min-w-[760px] items-start">
            {funnel.map((f, i) => {
              const active = f.머무름 > 0;
              const passed = i > 0 && funnel[i - 1]?.통과 > 0;
              return (
                <li key={f.key} className="flex flex-1 items-start last:flex-none">
                  <div className="flex w-[112px] flex-col items-center text-center">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-[13px] font-bold shadow-sm transition ${
                        active
                          ? "border-accent bg-accent text-white"
                          : passed
                            ? "border-good bg-good-soft text-good"
                            : "border-line-strong bg-surface text-ink-4"
                      }`}
                    >
                      {active ? f.머무름 : passed ? "✓" : i + 1}
                    </div>
                    <div className="mt-2 text-[12px] font-semibold text-ink">{f.key}</div>
                    <div className={`mt-0.5 text-[10.5px] ${active ? "font-medium text-accent" : "text-ink-4"}`}>
                      {active ? `${f.머무름}건 대기` : `통과 ${f.통과}건`}
                    </div>
                  </div>
                  {i < funnel.length - 1 && (
                    <div className="mt-5 flex min-w-[32px] flex-1 items-center px-2" aria-hidden>
                      <div className={`h-[3px] w-full rounded-full ${f.통과 > 0 ? "bg-good" : "bg-line"}`} />
                      <div
                        className={`-ml-1 h-2 w-2 rotate-45 border-r-2 border-t-2 ${
                          f.통과 > 0 ? "border-good" : "border-line-strong"
                        }`}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <div className="space-y-2.5">
        {ordered.map(({ task, stages }) => (
          <TaskTrack
            key={task.id}
            task={task}
            stages={stages}
            today={today}
            open={selectedId === task.id}
            onSelect={() => onSelect(task.id)}
          />
        ))}
      </div>
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
  const currentIndex = stages.findIndex((s) => s.current);
  const 멈춘칸 = stages[currentIndex];
  const style = ROLE_STYLE[task.role];

  return (
    <article
      className={`overflow-hidden rounded-lg border bg-surface shadow-card transition-all ${
        open ? "border-accent shadow-raised" : "border-line hover:border-line-strong hover:shadow-raised"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-expanded={open}
        className="w-full px-4 py-3.5 text-left"
      >
        <div className="flex flex-wrap items-start gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${style.badge}`}>
            {task.role}
          </span>
          <div className="min-w-[220px] flex-1">
            <h3
              className={`text-[13px] font-semibold leading-5 ${
                task.status === "완료" ? "text-ink-4 line-through" : "text-ink"
              }`}
            >
              {task.title}
            </h3>
            {멈춘칸 && task.status !== "완료" && (
              <p className="mt-0.5 text-[11px] text-ink-3">
                현재 <span className="font-semibold text-accent">{멈춘칸.key}</span>
                {멈춘칸.detail ? ` · ${멈춘칸.detail}` : " 단계에서 대기 중"}
              </p>
            )}
          </div>
          {남은날 !== null && (
            <span
              className={`num shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                지남 ? "bg-critical-soft text-critical" : "bg-sunk text-ink-3"
              }`}
            >
              {ddayLabel(남은날)} · {formatDue(task.dueDate)}
            </span>
          )}
        </div>

        <ol className="mt-4 flex min-w-0 items-start">
          {stages.map((s, i) => {
            const isPast = s.done;
            const isCurrent = s.current;
            return (
              <li key={s.key} className="flex min-w-0 flex-1 items-start last:flex-none">
                <div className="flex w-[72px] shrink-0 flex-col items-center text-center">
                  <span
                    aria-hidden
                    className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-bold transition ${
                      isCurrent
                        ? "border-accent bg-accent text-white ring-4 ring-accent-soft"
                        : isPast
                          ? "border-good bg-good text-white"
                          : "border-line-strong bg-surface text-ink-4"
                    }`}
                  >
                    {isPast ? "✓" : isCurrent ? "•" : i + 1}
                  </span>
                  <span
                    className={`mt-1.5 whitespace-nowrap text-[10.5px] ${
                      isCurrent
                        ? "font-semibold text-accent"
                        : isPast
                          ? "font-medium text-ink-3"
                          : "text-ink-4"
                    }`}
                  >
                    {s.key}
                  </span>
                  {isCurrent && (
                    <span className="mt-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-[9px] font-semibold text-accent">
                      현재
                    </span>
                  )}
                </div>
                {i < stages.length - 1 && (
                  <div className="mt-3.5 flex min-w-[16px] flex-1 items-center px-1" aria-hidden>
                    <div className={`h-[2px] w-full ${stages[i + 1].done || stages[i + 1].current ? "bg-good" : "bg-line"}`} />
                    <div
                      className={`-ml-1 h-1.5 w-1.5 rotate-45 border-r border-t ${
                        stages[i + 1].done || stages[i + 1].current ? "border-good" : "border-line-strong"
                      }`}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </button>

      {open && (
        <div className="border-t border-line bg-sunk/60 px-4 py-3">
          <div className="mb-2 text-[11px] font-semibold text-ink-2">단계별 처리 기록</div>
          <dl className="grid gap-1.5">
            {stages.map((s, i) => (
              <div key={s.key} className="grid grid-cols-[28px_70px_1fr_auto] items-start gap-2 rounded-md bg-surface px-2.5 py-2 text-[11.5px]">
                <div
                  className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${
                    s.current
                      ? "bg-accent text-white"
                      : s.done
                        ? "bg-good-soft text-good"
                        : "bg-sunk text-ink-4"
                  }`}
                >
                  {s.done ? "✓" : s.current ? "•" : i + 1}
                </div>
                <dt className={`font-medium ${s.current ? "text-accent" : s.done ? "text-ink-2" : "text-ink-4"}`}>
                  {s.key}
                </dt>
                <dd className="text-ink-3">{s.detail ?? (s.done ? "완료" : "아직 기록 없음")}</dd>
                <dd className="num whitespace-nowrap text-right text-[10.5px] text-ink-4">
                  {formatStageTime(s.at) || "—"}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </article>
  );
}
