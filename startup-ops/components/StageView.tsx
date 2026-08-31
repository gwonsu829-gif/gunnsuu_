"use client";

import { formatDue, daysUntil, ddayLabel, isOverdue } from "@/lib/dates";
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
      <p className="rounded-md border border-dashed border-line bg-surface px-4 py-12 text-center text-[13px] text-ink-4">
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
    <div className="flex flex-col gap-2.5 sm:gap-3">
      {/*
       * 단계별 현황.
       * 이전에는 원 + 연결선으로 그렸는데, 원 안에 숫자를 넣으면 '몇 번째 단계'인지와
       * '몇 건이 밀려 있는지'가 같은 자리에서 싸운다. 칸을 평평한 타일로 바꾸고
       * 숫자는 대기 건수 하나만 크게 두어, 눈이 큰 숫자를 따라가면 병목에 닿게 했다.
       */}
      <section className="rounded-md border border-line bg-surface px-3 py-2.5 sm:px-3.5 sm:py-3">
        <div className="mb-2.5 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <h2 className="text-[13px] font-semibold leading-tight text-ink">
            단계별 현황
          </h2>
          <p className="text-[10.5px] leading-snug text-ink-4 sm:text-[11px]">
            건수가 쌓이는 칸이 지금의 병목입니다
          </p>
        </div>

        {/* 모바일은 3열 격자, 데스크톱은 한 줄 + 사이에 꺾쇠. */}
        <div className="grid grid-cols-3 gap-1.5 sm:flex sm:items-stretch">
          {funnel.map((f, i) => {
            const 밀림 = f.머무름 > 0;
            return (
              <div
                key={f.key}
                className="contents sm:flex sm:flex-1 sm:items-stretch"
              >
                <div
                  className={`rounded-md border px-2 py-1.5 sm:flex-1 sm:px-2.5 sm:py-[7px] ${
                    밀림
                      ? "border-accent-line bg-accent-soft"
                      : "border-line bg-sunk"
                  }`}
                >
                  <div
                    className={`mb-0.5 text-[10px] leading-tight sm:text-[10.5px] ${
                      밀림 ? "text-ink-2" : "text-ink-4"
                    }`}
                  >
                    {f.key}
                  </div>
                  <div className="flex items-baseline gap-1 sm:gap-1.5">
                    <span
                      className={`num text-[14px] font-semibold leading-none sm:text-[15px] ${
                        밀림 ? "text-accent" : "text-ink-3"
                      }`}
                    >
                      {f.머무름}
                    </span>
                    <span
                      className={`text-[10px] leading-none ${
                        밀림 ? "text-ink-3" : "text-ink-4"
                      }`}
                    >
                      <span className="hidden sm:inline">대기 · </span>통과{" "}
                      {f.통과}
                    </span>
                  </div>
                </div>
                {i < funnel.length - 1 && (
                  <span
                    aria-hidden
                    className="hidden self-center px-1.5 text-[11px] text-line-strong sm:inline"
                  >
                    ›
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex flex-col gap-2 sm:gap-2.5">
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
  const 지남 = isOverdue(task.dueDate, today) && task.status !== "완료";
  const 멈춘칸 = stages.find((s) => s.current);
  const style = ROLE_STYLE[task.role];

  return (
    <article className="rounded-md border border-line bg-surface shadow-card transition-colors hover:border-line-strong">
      <button
        type="button"
        onClick={onSelect}
        aria-expanded={open}
        className="w-full px-3 py-2.5 text-left sm:px-3.5"
      >
        {/*
         * 모바일에서는 제목이 길어 배지·마감과 한 줄에 못 들어간다.
         * 제목만 아래 줄로 내리고(order-last + w-full) 데스크톱에서 되돌린다.
         */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 sm:flex-nowrap sm:gap-2.5">
          <span
            className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium leading-[1.35] ${style.badge}`}
          >
            {task.role}
          </span>
          <h3
            className={`order-last w-full text-[12.5px] font-medium leading-[1.4] sm:order-none sm:w-auto sm:min-w-0 sm:flex-1 sm:text-[13px] ${
              task.status === "완료" ? "text-ink-4 line-through" : "text-ink"
            }`}
          >
            {task.title}
          </h3>
          {남은날 !== null && (
            <span
              className={`num ml-auto shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10.5px] font-medium sm:ml-0 sm:px-[7px] sm:py-[3px] sm:text-[11px] ${
                지남 ? "bg-critical-soft text-critical" : "bg-sunk text-ink-3"
              }`}
            >
              {ddayLabel(남은날)} · {formatDue(task.dueDate)}
            </span>
          )}
        </div>

        {/*
         * 여섯 칸 레일. 가로 스크롤을 두지 않고 연결선이 남는 폭을 먹게 해서
         * 420px 화면에서도 여섯 칸이 다 보이게 한다 — 스크롤 뒤에 숨은 칸은
         * '어디서 멈췄나'를 묻는 이 화면에서 없는 것과 같다.
         */}
        <ol className="mt-2.5 flex items-center">
          {stages.map((s, i) => (
            <li key={s.key} className="contents">
              <div className="flex flex-col items-center gap-[3px] sm:gap-1">
                <span
                  aria-hidden
                  className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[8px] font-bold leading-none sm:h-4 sm:w-4 sm:text-[9px] ${
                    s.done
                      ? "border-good bg-good text-white"
                      : s.current
                        ? "border-accent bg-accent text-white"
                        : "border-line-strong bg-surface text-ink-4"
                  }`}
                >
                  {s.done ? "✓" : s.current ? "·" : ""}
                </span>
                <span
                  className={`whitespace-nowrap text-[9.5px] leading-none sm:text-[10px] ${
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
                  className={`mx-[3px] mb-[14px] h-px flex-1 sm:mx-1 sm:mb-4 ${
                    stages[i + 1].done ? "bg-good" : "bg-line"
                  }`}
                />
              )}
            </li>
          ))}
        </ol>

        <p className="mt-2 text-[11px] leading-snug text-ink-3">
          {멈춘칸 ? (
            <>
              <span className="font-semibold text-accent">{멈춘칸.key}</span>
              {멈춘칸.detail ? ` — ${멈춘칸.detail}` : "에서 대기 중"}
            </>
          ) : (
            "여섯 칸을 모두 지났습니다"
          )}
        </p>
      </button>

      {open && (
        <dl className="border-t border-line px-3 sm:px-3.5">
          {stages.map((s, i) => (
            <div
              key={s.key}
              className={`flex gap-2.5 py-1.5 ${
                i < stages.length - 1 ? "border-b border-line-soft" : ""
              }`}
            >
              <dt
                className={`w-11 flex-none text-[11.5px] leading-[1.4] ${
                  s.done ? "text-ink-2" : "text-ink-4"
                }`}
              >
                {s.key}
              </dt>
              <dd className="min-w-0 flex-1 text-[11.5px] leading-[1.4] text-ink-3">
                {s.detail ?? (s.done ? "완료" : "—")}
              </dd>
              {/* 기록이 없는 칸은 시각을 지어내지 않고 '기록 없음'으로 둔다. */}
              <dd className="num w-20 flex-none text-right text-[11.5px] leading-[1.4] text-ink-4">
                {formatStageTime(s.at) || "기록 없음"}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}
