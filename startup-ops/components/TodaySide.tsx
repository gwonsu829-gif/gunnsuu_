"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  Activity,
  avgHoursToAssign,
  buildActivity,
  clockKST,
} from "@/lib/activity";
import { daysUntil } from "@/lib/dates";
import { buildStages, countByStage } from "@/lib/stages";
import { AssigneeSuggestion } from "@/lib/suggest";
import { Task } from "@/lib/types";

/** 사건 종류마다 점 색을 달리해 훑기만 해도 성격이 구분되게 한다. */
const DOT: Record<Activity["kind"], string> = {
  수집: "bg-accent",
  담당: "bg-line-strong",
  진행: "bg-line-strong",
  완료: "bg-good",
  기한지남: "bg-critical",
};

export default function TodaySide({
  tasks,
  today,
  suggestions,
  onOpenFlow,
}: {
  tasks: Task[];
  today: string;
  suggestions: Map<string, AssigneeSuggestion>;
  onOpenFlow: () => void;
}) {
  return (
    <>
      <ActivityCard tasks={tasks} today={today} />
      <div className="flex flex-col gap-3">
        <BottleneckCard
          tasks={tasks}
          suggestions={suggestions}
          onOpenFlow={onOpenFlow}
        />
        <WorkloadCard tasks={tasks} today={today} />
        <NotesCard />
      </div>
    </>
  );
}

/* ---------------- 오늘 일어난 일 ---------------- */

function ActivityCard({ tasks, today }: { tasks: Task[]; today: string }) {
  const events = buildActivity(tasks, today);
  const byId = new Map(tasks.map((t) => [t.id, t]));

  return (
    <section className="rounded-md border border-line bg-surface shadow-card">
      <div className="flex items-baseline gap-2 px-4 pb-1 pt-3">
        <h2 className="text-[13px] font-semibold text-ink">오늘 일어난 일</h2>
        <span className="ml-auto text-[11px] text-ink-4">수집과 활동을 한 줄로</span>
      </div>

      {events.length === 0 ? (
        /* 조용한 날과 고장난 화면을 구분해 준다. */
        <p className="px-4 py-8 text-center text-[11.5px] text-ink-4">
          오늘은 아직 기록된 일이 없습니다.
        </p>
      ) : (
        <div className="px-4 pb-3.5 pt-2">
          {events.map((e, i) => (
            <div key={e.id} className="flex gap-2.5">
              <div className="w-11 flex-none pt-px">
                <span className="num text-[10.5px] text-ink-4">{clockKST(e.at)}</span>
              </div>
              <div className="flex w-2.5 flex-none flex-col items-center">
                <span className={`mt-1 h-[7px] w-[7px] rounded-full ${DOT[e.kind]}`} />
                {i < events.length - 1 && <span className="w-px flex-1 bg-line" />}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1 pb-3.5">
                <span className="text-[11.5px] font-medium leading-snug text-ink">
                  {e.title}
                </span>
                {e.detail && (
                  <span className="text-[11px] leading-relaxed text-ink-3">
                    {e.detail}
                  </span>
                )}
                {/* 한 원문이 여러 건으로 나뉜 경우에만 무엇으로 나뉘었는지 편다. */}
                {e.taskIds.length > 1 && (
                  <div className="mt-0.5 flex flex-col gap-0.5 border-l border-line pl-2.5">
                    {e.taskIds.map((id) => {
                      const t = byId.get(id);
                      return t ? (
                        <span key={id} className="text-[11px] leading-snug text-ink-2">
                          {t.title} ({t.role})
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------- 병목 ---------------- */

function BottleneckCard({
  tasks,
  suggestions,
  onOpenFlow,
}: {
  tasks: Task[];
  suggestions: Map<string, AssigneeSuggestion>;
  onOpenFlow: () => void;
}) {
  const funnel = countByStage(
    tasks.map((t) => buildStages(t, suggestions.get(t.id))),
  );
  const 최대 = Math.max(...funnel.map((f) => f.머무름), 0);
  const 막힌칸 = funnel
    .filter((f) => f.머무름 > 0)
    .sort((a, b) => b.머무름 - a.머무름)[0];

  return (
    <section className="flex flex-col gap-2.5 rounded-md border border-line bg-surface px-3.5 pb-3.5 pt-3 shadow-card">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[13px] font-semibold text-ink">병목</h2>
        <button
          type="button"
          onClick={onOpenFlow}
          className="ml-auto text-[11px] text-accent hover:underline"
        >
          흐름 열기
        </button>
      </div>

      <div className="flex h-[52px] items-end gap-[3px]">
        {funnel.map((f) => {
          const 있음 = f.머무름 > 0;
          // 가장 높은 칸만 진하게. 두 칸이 같으면 둘 다 진하다 — 실제로 둘 다 병목이다.
          const 최고 = 있음 && f.머무름 === 최대;
          return (
            <div key={f.key} className="flex flex-1 flex-col items-center gap-1">
              {있음 && (
                <span className="num text-[11px] font-semibold leading-none text-accent">
                  {f.머무름}
                </span>
              )}
              <span
                className={`w-full rounded-t-sm ${
                  최고 ? "bg-accent" : 있음 ? "bg-accent/50" : "bg-line"
                }`}
                style={{
                  height: 있음
                    ? `${Math.round((f.머무름 / 최대) * 26) + 4}px`
                    : "2px",
                }}
              />
              <span
                className={`text-[9.5px] leading-none ${
                  있음 ? "font-medium text-accent" : "text-ink-4"
                }`}
              >
                {f.key}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] leading-snug text-ink-3">
        {막힌칸
          ? `${막힌칸.key} 칸에 ${막힌칸.머무름}건이 멈춰 있습니다.`
          : "멈춰 있는 칸이 없습니다."}
      </p>
    </section>
  );
}

/* ---------------- 업무 현황 ---------------- */

function WorkloadCard({ tasks, today }: { tasks: Task[]; today: string }) {
  const 완료 = tasks.filter((t) => t.status === "완료").length;
  const 진행 = tasks.filter((t) => t.status === "진행중").length;
  const 지연 = tasks.filter((t) => {
    const d = daysUntil(t.dueDate, today);
    return t.status !== "완료" && d !== null && d < 0;
  }).length;
  const 합 = 완료 + 진행 + 지연;

  const 평균 = avgHoursToAssign(tasks);
  const 고친것 = tasks.filter(
    (t) => t.edited && Object.keys(t.edited).length > 0,
  ).length;

  const 막대 = [
    { label: "완료", n: 완료, tone: "bg-good" },
    { label: "진행", n: 진행, tone: "bg-accent" },
    { label: "지연", n: 지연, tone: "bg-critical" },
  ];

  return (
    <section className="flex flex-col gap-2.5 rounded-md border border-line bg-surface px-3.5 pb-3.5 pt-3 shadow-card">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[13px] font-semibold text-ink">업무 현황</h2>
        <span className="num ml-auto text-[11px] text-ink-3">
          전체 {tasks.length}건
        </span>
      </div>

      <div className="flex h-2 overflow-hidden rounded-full">
        {합 === 0 ? (
          <span className="w-full bg-line" />
        ) : (
          막대.map((b) => (
            <span
              key={b.label}
              className={b.tone}
              style={{ width: `${(b.n / 합) * 100}%` }}
            />
          ))
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {막대.map((b) => (
          <div key={b.label} className="flex items-center gap-2">
            <i className={`h-1.5 w-1.5 rounded-full ${b.tone}`} />
            <span className="flex-1 text-[11.5px] leading-tight text-ink-2">
              {b.label}
            </span>
            <span className="num text-[11.5px] font-medium text-ink">{b.n}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-line-soft pt-2">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[11px] leading-snug text-ink-3">
            담당 지정까지 평균
          </span>
          {/* 표본이 없으면 0이 아니라 '기록 없음'. 0은 즉시 배정된다는 거짓말이 된다. */}
          <span className="num text-[11px] font-medium text-ink">
            {평균 === null ? "기록 없음" : `${평균.toFixed(1)}시간`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[11px] leading-snug text-ink-3">
            사람이 고친 분류
          </span>
          <span className="num text-[11px] font-medium text-ink">
            {tasks.length}건 중 {고친것}건
          </span>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 메모 ---------------- */

const 저장_대기_ms = 800;

function NotesCard() {
  const [text, setText] = useState("");
  const [상태, set상태] = useState<
    "불러오는 중" | "저장됨" | "저장 중" | "저장 실패"
  >("불러오는 중");
  const timer = useRef<number | null>(null);
  /** 처음 불러온 값으로 저장이 한 번 도는 것을 막는다. */
  const 준비됨 = useRef(false);

  useEffect(() => {
    let 살아있음 = true;
    void (async () => {
      try {
        const res = await fetch("/api/notes", { cache: "no-store" });
        const data = (await res.json()) as { notes?: string };
        if (!살아있음) return;
        setText(data.notes ?? "");
        set상태("저장됨");
      } catch {
        if (살아있음) set상태("저장 실패");
      } finally {
        준비됨.current = true;
      }
    })();
    return () => {
      살아있음 = false;
    };
  }, []);

  const 저장 = useCallback(async (값: string) => {
    set상태("저장 중");
    try {
      const res = await fetch("/api/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: 값 }),
      });
      set상태(res.ok ? "저장됨" : "저장 실패");
    } catch {
      // 실패를 조용히 삼키면 사용자는 저장된 줄 안다.
      set상태("저장 실패");
    }
  }, []);

  function 입력(값: string) {
    setText(값);
    if (!준비됨.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void 저장(값), 저장_대기_ms);
  }

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  return (
    <section className="flex flex-col gap-1.5 px-0.5 pt-0.5">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[12px] font-semibold text-ink-2">메모</h2>
        <span
          className={`ml-auto text-[10.5px] ${
            상태 === "저장 실패" ? "text-critical" : "text-ink-4"
          }`}
        >
          {상태 === "저장됨" ? "자동 저장" : 상태}
        </span>
      </div>
      <textarea
        value={text}
        onChange={(e) => 입력(e.target.value)}
        rows={5}
        placeholder="여기 적은 것은 자동으로 저장됩니다."
        className="thin-scroll w-full resize-y rounded-md border border-line bg-surface px-2.5 py-2 text-[11.5px] leading-relaxed text-ink-2 placeholder:text-ink-4"
      />
    </section>
  );
}
