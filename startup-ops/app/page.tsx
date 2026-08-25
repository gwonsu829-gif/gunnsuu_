"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import IntegrationStatus, { Integrations } from "@/components/IntegrationStatus";
import KanbanBoard from "@/components/KanbanBoard";
import SourcePanel from "@/components/SourcePanel";
import SummaryStrip from "@/components/SummaryStrip";
import TaskList from "@/components/TaskList";
import { todayISO } from "@/lib/dates";
import { findDuplicate } from "@/lib/dedupe";
import { Sample, SampleId, buildSamples } from "@/lib/samples";
import { ExtractResponse, Priority, Role, Status, Task } from "@/lib/types";

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

  const seq = useRef(0);

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
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
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

  return (
    <main className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h1 className="text-[15px] font-semibold text-slate-900">
            업무 자동 분류 대시보드
          </h1>
          <p className="text-[12px] text-slate-500">
            흩어진 원문에서 할일을 추출해 직무별로 모읍니다
          </p>
        </div>
        <div className="flex items-center gap-2">
          {demo && (
            <span
              title={demoReason ?? undefined}
              className="flex items-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800"
            >
              <span className="font-semibold">데모 모드</span>
              {demoReason && (
                <span className="max-w-[280px] truncate border-l border-amber-300 pl-1.5 font-normal text-amber-700">
                  {demoReason}
                </span>
              )}
            </span>
          )}
          <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500">
            기준일 {today}
          </span>
        </div>
      </header>

      <SummaryStrip tasks={tasks} today={today} />

      <IntegrationStatus
        integrations={integrations}
        syncing={syncing}
        onRefresh={() => void loadServerTasks()}
      />

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
          onPriorityChange={(id, priority: Priority) => updateTask(id, { priority })}
          onAssigneeChange={(id, assignee) => updateTask(id, { assignee })}
          onClear={() => {
            if (tasks.some((t) => t.origin === "server")) {
              void fetch("/api/tasks", { method: "DELETE" }).catch(() => undefined);
            }
            setTasks([]);
            setSelectedId(null);
          }}
        />
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-slate-900">
            직무별 칸반
          </h2>
          <p className="text-[11px] text-slate-400">
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
  };
}
