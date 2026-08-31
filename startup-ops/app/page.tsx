"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import IntegrationStatus, { Integrations } from "@/components/IntegrationStatus";
import KanbanBoard from "@/components/KanbanBoard";
import MonthView from "@/components/MonthView";
import PlannerView from "@/components/PlannerView";
import WeekView from "@/components/WeekView";
import SourcePanel from "@/components/SourcePanel";
import StageView from "@/components/StageView";
import SummaryStrip from "@/components/SummaryStrip";
import TaskList from "@/components/TaskList";
import { todayISO } from "@/lib/dates";
import { findDuplicate } from "@/lib/dedupe";
import { buildSuggestions } from "@/lib/suggest";
import { UNASSIGNED } from "@/lib/team";
import { Sample, SampleId, buildSamples } from "@/lib/samples";
import { ExtractResponse, Priority, Role, Slot, StageAt, Status, Task } from "@/lib/types";

export default function Page() {
  // 서버·클라이언트가 같은 날짜를 쓰도록 렌더 중 한 번만 계산한다.
  const today = useMemo(() => todayISO(), []);
  const samples = useMemo(() => buildSamples(today), [today]);

  const [text, setText] = useState("");
  const [activeSampleId, setActiveSampleId] = useState<SampleId | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [demoReason, setDemoReason] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [syncing, setSyncing] = useState(false);
  /**
   * 두 화면이 서로 다른 질문에 답한다.
   * 오늘 — 마감이 가까운 순. "뭐부터 하나"
   * 인입 — 직무별로 쌓인 것. "새로 뭐가 들어왔고 분류가 맞나"
   * 흐름 — 한 건이 어디까지 왔나. "왜 아직 안 끝났나"
   */
  const [tab, setTab] = useState<"today" | "inbox" | "flow" | "calendar">(
    "today",
  );
  /*
   * 달력은 탭을 둘로 쪼개지 않고 안에서 월·주를 바꾼다.
   * 둘 다 "언제 하기로 했나"에 답하는 같은 질문이라, 탭을 나누면
   * 사용자가 답이 아니라 화면 이름을 먼저 골라야 한다.
   */
  const [달력보기, set달력보기] = useState<"month" | "week">("week");
  /** 진단 도구는 평소에 접어둔다. 매일 쓰는 화면이 관리자 버튼에 밀리면 안 된다. */
  const [toolsOpen, setToolsOpen] = useState(false);

  const seq = useRef(0);

  /**
   * 담당자 제안은 저장하지 않고 화면에서 매번 다시 계산한다.
   * 한 건을 지정하는 순간 비슷한 다른 건에도 근거가 생겨야 하는데,
   * 수집 시점에 굳혀두면 그 반영이 안 된다.
   */
  const suggestions = useMemo(() => buildSuggestions(tasks), [tasks]);

  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null;
  // 선택한 카드의 근거는 그 카드가 추출된 원문이 화면에 떠 있을 때만 하이라이트한다.
  const highlight =
    selectedTask && selectedTask.rawText === text ? selectedTask.source : null;

  /**
   * 메일·디스코드로 들어와 저장소에 쌓인 할일을 불러온다.
   * 붙여넣기로 뽑은 것(local)은 건드리지 않고 자동 수집분(server)만 교체한다.
   */
  const loadServerTasks = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/tasks", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        tasks: ServerTask[];
        연동: Integrations;
      };
      setIntegrations(data.연동);
      setTasks((prev) => [
        ...prev.filter((t) => t.origin === "local"),
        ...data.tasks.map(toTask),
      ]);
    } catch {
      // 자동 수집을 못 읽어와도 붙여넣기 흐름은 계속 되어야 한다.
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void loadServerTasks();
    const timer = window.setInterval(() => void loadServerTasks(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadServerTasks]);

  function injectSample(sample: Sample) {
    setText(sample.text);
    setActiveSampleId(sample.id);
    setSelectedId(null);
    setError(null);
  }

  function handleTextChange(value: string) {
    setText(value);
    setActiveSampleId(null);
    setSelectedId(null);
  }

  async function extract() {
    const source = text.trim();
    if (!source || loading) return;

    setLoading(true);
    setError(null);

    const sourceLabel =
      samples.find((s) => s.id === activeSampleId)?.label ?? "붙여넣은 원문";

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: source, sampleId: activeSampleId }),
      });

      const data = (await res.json()) as ExtractResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "추출에 실패했습니다.");

      setDemo(data.demo);
      setDemoReason(data.demoReason ?? null);

      if (data.tasks.length === 0) {
        setError("이 원문에서는 할일을 찾지 못했습니다.");
        return;
      }

      setTasks((prev) => {
        const next = [...prev];
        for (const extracted of data.tasks) {
          const dup = findDuplicate(extracted.title, next);
          seq.current += 1;
          next.push({
            ...extracted,
            id: `local-${seq.current}`,
            origin: "local",
            channel: "manual",
            rawText: text,
            sourceLabel,
            duplicateOf: dup?.id,
            createdAt: new Date().toISOString(),
          });
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function moveTask(id: string, role: Role, status: Status) {
    updateTask(id, { role, status });
  }

  /** AI가 정한 값을 사람이 덮어쓰는 유일한 경로. */
  function updateTask(id: string, patch: Partial<Task>) {
    // 대상은 현재 렌더의 tasks에서 바로 찾는다.
    // setTasks 콜백 안에서 꺼내면 그 콜백이 나중에 실행돼 아래 조건이 항상 빗나간다.
    const target = tasks.find((t) => t.id === id);

    /*
     * 단계 시각을 화면에서도 찍는다.
     * 자동 수집분은 서버가 다시 찍어 덮어쓰지만, 붙여넣기로 뽑은 것은
     * 서버를 지나지 않으므로 여기서 안 찍으면 "흐름" 화면이 영영 비어 있다.
     */
    const now = new Date().toISOString();
    const stamp: StageAt = {};
    if (patch.assignee && patch.assignee !== UNASSIGNED) stamp.assigned = now;
    if (patch.status === "진행중") stamp.started = now;
    if (patch.status === "완료") stamp.done = now;

    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              ...patch,
              stageAt: Object.keys(stamp).length
                ? { ...t.stageAt, ...stamp }
                : t.stageAt,
            }
          : t,
      ),
    );
    // 자동 수집분은 저장소에도 반영해야 새로고침 뒤에도 남는다.
    // 화면은 이미 바뀌었으므로 실패해도 흐름을 막지 않는다.
    if (target?.origin === "server") {
      void fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, patch }),
      }).catch(() => undefined);
    }
  }

  /**
   * 시간 잡기·비우기.
   *
   * updateTask를 못 쓰는 이유: 그쪽 patch가 Partial<Task>라 slot에 null을 넣을 수 없다.
   * 화면에서는 필드를 지우고(undefined), 서버에는 "해제"를 뜻하는 null을 보낸다.
   */
  function setSlot(id: string, slot: Slot | null) {
    const target = tasks.find((t) => t.id === id);

    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, slot: slot ?? undefined } : t)),
    );

    if (target?.origin === "server") {
      void fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, patch: { slot } }),
      }).catch(() => undefined);
    }
  }

  function selectTask(id: string) {
    setSelectedId((cur) => (cur === id ? null : id));
    const task = tasks.find((t) => t.id === id);
    // 다른 원문에서 나온 카드를 고르면 그 원문을 왼쪽에 되돌려 근거를 보여준다.
    if (task && task.rawText !== text) {
      setText(task.rawText);
      setActiveSampleId(
        samples.find((s) => s.text === task.rawText)?.id ?? null,
      );
    }
  }

  /**
   * 탭 이름을 "오늘/인입/흐름"에서 질문형으로 바꿨다.
   * 대표님이 화면을 열고 "뭘 봐야 하는지 모르겠다"고 한 게 이 화면의 진짜 문제였고,
   * 명사 세 개는 그 질문에 답하지 못한다. 라벨이 답을 알려주게 한다.
   */
  const TABS = [
    {
      key: "today" as const,
      label: "오늘 할 일",
      question: "뭐부터 하면 되나요?",
      count: tasks.filter((t) => t.status !== "완료").length,
    },
    {
      key: "inbox" as const,
      label: "새로 들어온 것",
      question: "뭐가 들어왔고 분류가 맞나요?",
      count: tasks.length,
    },
    {
      key: "calendar" as const,
      label: "일정",
      question: "언제 하기로 했나요?",
      // 아직 시간을 안 잡은 것이 이 화면에서 손댈 거리다.
      count: tasks.filter((t) => t.status !== "완료" && !t.slot).length,
    },
    {
      key: "flow" as const,
      label: "진행 상황",
      question: "왜 아직 안 끝났나요?",
      count: tasks.filter((t) => t.status !== "완료").length,
    },
  ];

  const 연결수 = integrations
    ? [
        integrations.AI,
        integrations.메일,
        integrations.디스코드,
        integrations.저장소 === "redis",
      ].filter(Boolean).length
    : 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-[1440px] flex-col gap-3 px-3 py-4 sm:gap-4 sm:px-5 sm:py-6">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-[13px] font-bold text-white"
          >
            할
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[16px] font-bold tracking-[-0.015em] text-ink sm:text-[17px]">
              업무 자동 분류 대시보드
            </h1>
            <p className="hidden text-[12px] text-ink-3 sm:block">
              메일과 디스코드에 흩어진 할일을 한곳에 모읍니다
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {demo && (
            <span
              title={demoReason ?? undefined}
              className="rounded-md border border-warn-line bg-warn-soft px-2 py-1 text-[11px] font-semibold text-warn"
            >
              데모 모드
            </span>
          )}
          <span className="num hidden rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink-3 sm:inline">
            기준일 {today}
          </span>
          <button
            type="button"
            onClick={() => setToolsOpen((v) => !v)}
            aria-expanded={toolsOpen}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition ${
              toolsOpen
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-surface text-ink-2 hover:border-line-strong"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                연결수 === 4 ? "bg-good" : "bg-warn"
              }`}
            />
            설정·도구
            <span className="num text-ink-4">{연결수}/4</span>
          </button>
        </div>
      </header>

      {toolsOpen && (
        <IntegrationStatus
          integrations={integrations}
          syncing={syncing}
          onRefresh={() => void loadServerTasks()}
          onClose={() => setToolsOpen(false)}
        />
      )}

      {/* inbox는 예외 — 0건이어도 원문을 넣는 화면이다. 여기까지 덮으면 추출로 갈 길이 막힌다. */}
      {tasks.length === 0 && tab !== "inbox" ? (
        /*
         * 빈 화면에 지표 0 여섯 개와 빈 상자를 띄우면 처음 온 사람은
         * 고장난 화면으로 읽는다. 할일이 하나도 없을 때는 지표·탭을 전부 감추고
         * 다음에 누를 것 하나만 남긴다.
         */
        <section className="rounded-lg border border-line bg-surface p-5 shadow-card sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
            시작하기
          </p>
          <h2 className="mt-1.5 text-[19px] font-bold text-ink sm:text-[22px]">
            아직 모인 할일이 없습니다
          </h2>
          <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-ink-3">
            메일과 디스코드는 자동으로 수집됩니다. 지금 어떻게 동작하는지 보려면
            아래 예시 원문 중 하나를 골라 눌러보세요. AI가 할일을 뽑아 직무별로
            나누고 담당자까지 제안합니다.
          </p>

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {samples.map((sample, i) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => {
                  injectSample(sample);
                  setTab("inbox");
                }}
                className="group flex flex-col items-start gap-1 rounded-lg border border-line bg-sunk px-3.5 py-3 text-left transition hover:border-accent hover:bg-accent-soft"
              >
                <span className="num flex h-5 w-5 items-center justify-center rounded-md bg-surface text-[11px] font-bold text-ink-3 group-hover:bg-accent group-hover:text-white">
                  {i + 1}
                </span>
                <span className="mt-1 text-[13px] font-semibold text-ink">
                  {sample.label}
                </span>
                <span className="text-[11.5px] leading-snug text-ink-3">
                  {sample.hint}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line-soft pt-4">
            <button
              type="button"
              onClick={() => setTab("inbox")}
              className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:border-ink-4 hover:text-ink"
            >
              직접 붙여넣기
            </button>
            <button
              type="button"
              onClick={() => void loadServerTasks()}
              disabled={syncing}
              className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:border-ink-4 hover:text-ink disabled:opacity-50"
            >
              {syncing ? "불러오는 중" : "수집된 것 다시 확인"}
            </button>
            <span className="text-[11px] text-ink-4">
              30초마다 자동으로 다시 확인합니다
            </span>
          </div>
        </section>
      ) : (
        <>
          {/*
            '오늘'에서는 숨긴다. 그 탭이 같은 숫자를 요약 문장으로 다시 말하기 때문에
            둘을 함께 두면 어느 쪽을 봐야 하는지가 또 흐려진다.
          */}
          {tasks.length > 0 && tab !== "today" && (
            <SummaryStrip tasks={tasks} today={today} />
          )}

          <nav
            aria-label="화면 전환"
            className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:px-0"
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={tab === t.key}
                aria-label={`${t.label} — ${t.question}`}
                className={`flex min-w-[152px] shrink-0 flex-col items-start gap-0.5 rounded-lg border px-3.5 py-2.5 text-left transition sm:flex-1 ${
                  tab === t.key
                    ? "border-accent bg-accent-soft shadow-card"
                    : "border-line bg-surface hover:border-line-strong"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={`text-[13.5px] font-semibold ${
                      tab === t.key ? "text-accent" : "text-ink"
                    }`}
                  >
                    {t.label}
                  </span>
                  {t.count > 0 && (
                    <span
                      className={`num rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        tab === t.key
                          ? "bg-accent text-white"
                          : "bg-sunk text-ink-3"
                      }`}
                    >
                      {t.count}
                    </span>
                  )}
                </span>
                <span
                  className={`text-[11px] ${
                    tab === t.key ? "text-accent" : "text-ink-4"
                  }`}
                >
                  {t.question}
                </span>
              </button>
            ))}
          </nav>

          {tab === "calendar" ? (
            <div className="flex flex-col gap-3">
              <div className="flex gap-0.5 self-start rounded-md border border-line bg-surface p-0.5">
                {(
                  [
                    ["week", "주"],
                    ["month", "월"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => set달력보기(key)}
                    aria-current={달력보기 === key}
                    className={`rounded px-3 py-1 text-[11.5px] transition ${
                      달력보기 === key
                        ? "bg-accent font-medium text-white"
                        : "text-ink-3 hover:bg-sunk"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {달력보기 === "week" ? (
                <WeekView
                  tasks={tasks}
                  today={today}
                  selectedId={selectedId}
                  onSelect={(id) =>
                    setSelectedId((cur) => (cur === id ? null : id))
                  }
                  onSlotChange={setSlot}
                  onOpenFlow={() => setTab("flow")}
                />
              ) : (
                <MonthView
                  tasks={tasks}
                  today={today}
                  selectedId={selectedId}
                  onSelect={(id) =>
                    setSelectedId((cur) => (cur === id ? null : id))
                  }
                  onOpenWeek={() => set달력보기("week")}
                />
              )}
            </div>
          ) : tab === "flow" ? (
            <StageView
              tasks={tasks}
              today={today}
              suggestions={suggestions}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
            />
          ) : tab === "today" ? (
            <PlannerView
              tasks={tasks}
              today={today}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId((cur) => (cur === id ? null : id));
              }}
              onStatusChange={(id, status) => updateTask(id, { status })}
              suggestions={suggestions}
              onAssigneeChange={(id, assignee) => updateTask(id, { assignee })}
              onSlotChange={setSlot}
              onOpenFlow={() => setTab("flow")}
            />
          ) : (
            <>
              <div className="grid gap-3 lg:min-h-[560px] lg:grid-cols-2">
                <SourcePanel
                  value={text}
                  onChange={handleTextChange}
                  samples={samples}
                  activeSampleId={activeSampleId}
                  onInjectSample={injectSample}
                  onExtract={extract}
                  loading={loading}
                  highlight={highlight}
                  onExitHighlight={() => setSelectedId(null)}
                  error={error}
                />
                <TaskList
                  tasks={tasks}
                  selectedId={selectedId}
                  today={today}
                  onSelect={selectTask}
                  onPriorityChange={(id, priority: Priority) =>
                    updateTask(id, { priority })
                  }
                  onAssigneeChange={(id, assignee) =>
                    updateTask(id, { assignee })
                  }
                  suggestions={suggestions}
                  onClear={() => {
                    if (tasks.some((t) => t.origin === "server")) {
                      void fetch("/api/tasks", { method: "DELETE" }).catch(
                        () => undefined,
                      );
                    }
                    setTasks([]);
                    setSelectedId(null);
                  }}
                />
              </div>

              <section className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h2 className="text-[13.5px] font-semibold text-ink">
                    직무별 칸반
                  </h2>
                  <p className="text-[11px] text-ink-4">
                    카드를 끌어 상태를 바꾸고, 다른 직무 레인에 놓으면 직무도 함께
                    바뀝니다
                  </p>
                </div>
                <KanbanBoard
                  tasks={tasks}
                  today={today}
                  selectedId={selectedId}
                  onSelect={selectTask}
                  onMove={moveTask}
                />
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}

/* ---------- 서버에서 오는 형태 ---------- */

interface ServerTask {
  id: string;
  title: string;
  role: Role;
  priority: Priority;
  dueDate: string;
  assignee: string;
  /** 판단 근거가 된 원문 문장 */
  source: string;
  status: Status;
  /** 어느 채널로 들어왔는지 */
  channel: "manual" | "email" | "discord";
  sourceLabel: string;
  rawText: string;
  createdAt: string;
  duplicateOf?: string;
  stageAt?: StageAt;
}

function toTask(t: ServerTask): Task {
  return {
    title: t.title,
    role: t.role,
    priority: t.priority,
    dueDate: t.dueDate,
    assignee: t.assignee,
    source: t.source,
    status: t.status,
    id: t.id,
    origin: "server",
    channel: t.channel,
    rawText: t.rawText,
    sourceLabel: t.sourceLabel,
    duplicateOf: t.duplicateOf,
    stageAt: t.stageAt,
    createdAt: t.createdAt,
  };
}
