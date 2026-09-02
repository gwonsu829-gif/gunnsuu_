"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AppShell, { NavItem, TabKey } from "./AppShell";
import { Integrations } from "./IntegrationStatus";
import KanbanBoard from "./KanbanBoard";
import MailView from "./MailView";
import MonthView from "./MonthView";
import OverviewView from "./OverviewView";
import PlannerView from "./PlannerView";
import SettingsView, { SettingsInfo } from "./SettingsView";
import SourcePanel from "./SourcePanel";
import StageView from "./StageView";
import SummaryStrip from "./SummaryStrip";
import TaskList from "./TaskList";
import { TeamProvider } from "./TeamContext";
import ToastStack, { ToastItem } from "./Toast";
import WeekView from "./WeekView";
import { todayISO } from "@/lib/dates";
import { findDuplicate } from "@/lib/dedupe";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { buildSuggestions } from "@/lib/suggest";
import { UNASSIGNED } from "@/lib/team";
import { Sample, SampleId, buildSamples } from "@/lib/samples";
import {
  AuditEntry,
  BusyEvent,
  ExtractResponse,
  MailLabel,
  MailRecord,
  Priority,
  Role,
  Settings,
  Slot,
  StageAt,
  Status,
  Task,
} from "@/lib/types";

const TABS: TabKey[] = ["overview", "mail", "calendar", "inbox", "flow", "settings"];
const USER_KEY = "ops_user";

interface Props {
  initialTab?: string | null;
  googleNotice?: string | null;
}

/**
 * 화면 상태를 전부 쥐고 있는 곳.
 *
 * 화면이 여섯 개지만 데이터는 하나다 — 할일·메일·설정·이력을 여기서 30초마다 받아
 * 모든 화면에 같은 것을 보여준다. 세 사람이 각자 다른 숫자를 보는 순간 대화가 어긋난다.
 */
export default function Dashboard({ initialTab, googleNotice }: Props) {
  // 서버·클라이언트가 같은 날짜를 쓰도록 렌더 중 한 번만 계산한다.
  const today = useMemo(() => todayISO(), []);
  const samples = useMemo(() => buildSamples(today), [today]);

  const [tab, setTabState] = useState<TabKey>(
    TABS.includes(initialTab as TabKey) ? (initialTab as TabKey) : "overview",
  );
  const [text, setText] = useState("");
  const [activeSampleId, setActiveSampleId] = useState<SampleId | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mails, setMails] = useState<MailRecord[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [busy, setBusy] = useState<BusyEvent[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsInfo, setSettingsInfo] = useState<SettingsInfo | null>(null);
  const [lastMailSync, setLastMailSync] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [demoReason, setDemoReason] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [mailSyncing, setMailSyncing] = useState(false);
  const [달력보기, set달력보기] = useState<"month" | "week">("week");
  const [search, setSearch] = useState("");
  const [user, setUser] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const seq = useRef(0);
  const toastSeq = useRef(0);
  const rangeRef = useRef<{ from: string; to: string } | null>(null);

  /* ---------- 탭은 주소에도 남긴다. 새로고침·공유 링크가 같은 화면을 연다. ---------- */
  function setTab(next: TabKey) {
    setTabState(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (next === "overview") url.searchParams.delete("tab");
      else url.searchParams.set("tab", next);
      url.searchParams.delete("google");
      url.searchParams.delete("reason");
      window.history.replaceState(null, "", url.toString());
    }
  }

  /* ---------- 알림 ---------- */
  const toast = useCallback((tone: ToastItem["tone"], text: string) => {
    toastSeq.current += 1;
    const id = toastSeq.current;
    setToasts((prev) => [...prev.slice(-3), { id, tone, text }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), tone === "critical" ? 9000 : 5000);
  }, []);

  /* ---------- 내가 누구인지 ---------- */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(USER_KEY);
      if (saved) setUser(saved);
    } catch {
      // 사생활 모드 등. 이름 없이도 화면은 돈다.
    }
  }, []);
  function pickUser(name: string) {
    setUser(name);
    try {
      window.localStorage.setItem(USER_KEY, name);
    } catch {
      // 무시
    }
  }
  const userHeaders = useCallback(
    (): Record<string, string> => ({
      "Content-Type": "application/json",
      "x-ops-user": encodeURIComponent(user ?? ""),
    }),
    [user],
  );

  const googleConnected = Boolean(integrations?.구글);
  const discordConnected = Boolean(integrations?.디스코드);

  /* ---------- 서버에서 불러오기 ---------- */
  const loadServerTasks = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/tasks", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        tasks: ServerTask[];
        settings?: Settings;
        연동: Integrations;
      };
      setIntegrations(data.연동);
      if (data.settings) setSettings(data.settings);
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

  const loadMails = useCallback(async () => {
    try {
      const res = await fetch("/api/mail", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { mails: MailRecord[]; lastSyncAt: string | null };
      setMails(data.mails);
      setLastMailSync(data.lastSyncAt);
    } catch {
      // 메일함이 안 읽혀도 나머지는 돈다.
    }
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      const res = await fetch("/api/audit?limit=40", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { entries: AuditEntry[] };
      setAudit(data.entries);
    } catch {
      // 무시
    }
  }, []);

  const loadSettingsInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as SettingsInfo;
      setSettingsInfo(data);
      setSettings(data.settings);
    } catch {
      // 무시
    }
  }, []);

  const loadBusy = useCallback(async () => {
    const r = rangeRef.current;
    if (!r) return;
    try {
      const res = await fetch(
        `/api/calendar?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as { events: BusyEvent[] };
      setBusy(data.events);
    } catch {
      // 무시
    }
  }, []);

  /**
   * 디스코드 수집. 서버가 5분 문턱을 지키므로 자주 불러도 실제로는 5분에 한 번만 돈다.
   * 새 대화가 없으면 AI를 부르지 않으므로 비용도 그때만 든다.
   */
  const pullDiscord = useCallback(async () => {
    if (!discordConnected) return;
    try {
      const res = await fetch("/api/discord/sync", { method: "POST" });
      const r = (await res.json()) as {
        건너뜀?: string;
        채널별?: { 추가된_할일?: number; 콕집은_할일?: number }[];
      };
      if (!res.ok || r.건너뜀 || !r.채널별?.length) return;
      const 자동 = r.채널별.reduce((n, c) => n + (c.추가된_할일 ?? 0), 0);
      const 콕 = r.채널별.reduce((n, c) => n + (c.콕집은_할일 ?? 0), 0);
      if (자동 + 콕 > 0) {
        await Promise.all([loadServerTasks(), loadAudit()]);
        toast(
          "info",
          콕 > 0
            ? `디스코드에서 할일 ${자동 + 콕}건 (그중 ${콕}건은 반응으로 콕 집은 것).`
            : `디스코드에서 할일 ${자동}건이 새로 들어왔습니다.`,
        );
      }
    } catch {
      // 수집이 안 돼도 나머지 화면은 돌아야 한다.
    }
  }, [discordConnected, loadServerTasks, loadAudit, toast]);

  /**
   * 구글 쪽 변화를 끌어온다. 서버가 5분 문턱을 지키므로 자주 불러도 비용이 안 든다.
   * 캘린더는 syncToken이라 가볍다.
   */
  const pullGoogle = useCallback(async () => {
    if (!googleConnected) return;
    try {
      const [mail, cal] = await Promise.all([
        fetch("/api/mail/sync", { method: "POST" }).then((r) => r.json() as Promise<{ tasksAdded?: number; skipped?: string; classified?: number }>),
        fetch("/api/calendar/sync", { method: "POST" }).then((r) => r.json() as Promise<{ moved?: string[]; cleared?: string[] }>),
      ]);
      if (mail.classified) {
        await Promise.all([loadMails(), loadServerTasks()]);
        if (mail.tasksAdded) toast("info", `메일에서 할일 ${mail.tasksAdded}건이 새로 들어왔습니다.`);
      }
      if ((cal.moved?.length ?? 0) + (cal.cleared?.length ?? 0) > 0) {
        await loadServerTasks();
        toast("info", `구글 캘린더에서 바뀐 일정 ${(cal.moved?.length ?? 0) + (cal.cleared?.length ?? 0)}건을 반영했습니다.`);
      }
    } catch {
      // 무시
    }
  }, [googleConnected, loadMails, loadServerTasks, toast]);

  useEffect(() => {
    void loadServerTasks();
    void loadMails();
    void loadAudit();
    void loadSettingsInfo();
    const timer = window.setInterval(() => {
      void loadServerTasks();
      void loadAudit();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadServerTasks, loadMails, loadAudit, loadSettingsInfo]);

  useEffect(() => {
    if (!googleConnected) return;
    void pullGoogle();
    void loadBusy();
    const timer = window.setInterval(() => {
      void pullGoogle();
      void loadMails();
      void loadBusy();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [googleConnected, pullGoogle, loadMails, loadBusy]);

  useEffect(() => {
    if (!discordConnected) return;
    void pullDiscord();
    const timer = window.setInterval(() => void pullDiscord(), 60_000);
    return () => window.clearInterval(timer);
  }, [discordConnected, pullDiscord]);

  useEffect(() => {
    if (googleNotice) toast(googleNotice.startsWith("구글 계정이 연결") ? "good" : "warn", googleNotice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- 담당자 제안: 저장하지 않고 매번 다시 계산 ---------- */
  const suggestions = useMemo(() => buildSuggestions(tasks), [tasks]);

  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null;
  const highlight =
    selectedTask && selectedTask.rawText === text ? selectedTask.source : null;

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

  /* ---------- 서버에 저장 (충돌 검사 포함) ---------- */
  async function patchServer(id: string, patch: Record<string, unknown>, expectedVersion?: number) {
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: userHeaders(),
        body: JSON.stringify({ id, patch, expectedVersion }),
      });
      const data = (await res.json()) as { task?: ServerTask; error?: string; conflict?: boolean; calendar?: string };
      if (res.status === 409 && data.task) {
        /*
         * 다른 사람이 먼저 바꿨다. 내가 화면에서 바꾼 값을 서버 값으로 되돌리고 알린다.
         * 조용히 덮어쓰면 "내가 분명 바꿨는데"가 두 사람 사이에서 반복된다.
         */
        const fresh = toTask(data.task);
        setTasks((prev) => prev.map((t) => (t.id === id ? fresh : t)));
        toast("warn", data.error ?? "다른 사람이 방금 이 할일을 바꿨습니다.");
        return;
      }
      if (!res.ok) {
        toast("critical", data.error ?? "저장하지 못했습니다.");
        void loadServerTasks();
        return;
      }
      if (data.task) {
        const fresh = toTask(data.task);
        setTasks((prev) => prev.map((t) => (t.id === id ? fresh : t)));
      }
      if (data.calendar?.startsWith("failed")) {
        toast("warn", `대시보드에는 저장됐지만 구글 캘린더 반영은 실패했습니다 (${data.calendar.slice(8)})`);
      } else if (data.calendar === "synced") {
        toast("good", "구글 캘린더에도 올렸습니다.");
      } else if (data.calendar === "removed") {
        toast("good", "구글 캘린더에서도 지웠습니다.");
      }
    } catch {
      toast("critical", "서버에 닿지 못했습니다. 잠시 뒤 다시 시도하세요.");
    }
  }

  function moveTask(id: string, role: Role, status: Status) {
    updateTask(id, { role, status });
  }

  /** AI가 정한 값을 사람이 덮어쓰는 유일한 경로. */
  function updateTask(id: string, patch: Partial<Task>) {
    const target = tasks.find((t) => t.id === id);
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
              updatedBy: user ?? t.updatedBy,
              stageAt: Object.keys(stamp).length ? { ...t.stageAt, ...stamp } : t.stageAt,
            }
          : t,
      ),
    );
    if (target?.origin === "server") {
      void patchServer(id, patch, target.version);
    }
  }

  function setSlot(id: string, slot: Slot | null) {
    const target = tasks.find((t) => t.id === id);
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, slot: slot ?? undefined } : t)),
    );
    if (target?.origin === "server") {
      void patchServer(id, { slot }, target.version);
    } else if (slot && googleConnected) {
      toast("info", "붙여넣기로 뽑은 할일은 저장소에 없어 캘린더에 올라가지 않습니다.");
    }
  }

  function selectTask(id: string) {
    setSelectedId((cur) => (cur === id ? null : id));
    const task = tasks.find((t) => t.id === id);
    if (task && task.rawText !== text) {
      setText(task.rawText);
      setActiveSampleId(samples.find((s) => s.text === task.rawText)?.id ?? null);
    }
  }

  /** 개요·메일함에서 할일을 누르면 그 할일이 보이는 화면으로 간다. */
  function jumpToTask(id: string) {
    setSelectedId(id);
    setTab("flow");
  }

  /* ---------- 메일 ---------- */
  async function syncMailNow() {
    setMailSyncing(true);
    try {
      const res = await fetch("/api/mail/sync?force=1", { method: "POST" });
      const r = (await res.json()) as {
        ok: boolean;
        skipped?: string;
        fetched: number;
        classified: number;
        tasksAdded: number;
        failed: { subject: string; reason: string }[];
        error?: string;
      };
      if (!res.ok || r.skipped) {
        toast("warn", r.skipped ?? r.error ?? "동기화하지 못했습니다.");
      } else {
        toast(
          "good",
          r.fetched === 0
            ? "새 메일이 없습니다."
            : `메일 ${r.classified}통 분류, 할일 ${r.tasksAdded}건 추가${r.failed.length ? ` · ${r.failed.length}통은 다음에 다시 시도` : ""}`,
        );
      }
      await Promise.all([loadMails(), loadServerTasks(), loadAudit()]);
    } catch {
      toast("critical", "서버에 닿지 못했습니다.");
    } finally {
      setMailSyncing(false);
    }
  }

  async function relabel(id: string, labels: MailLabel[]) {
    const res = await fetch("/api/mail", {
      method: "PATCH",
      headers: userHeaders(),
      body: JSON.stringify({ id, labels }),
    });
    const data = (await res.json()) as { mail?: MailRecord; error?: string };
    if (!res.ok || !data.mail) {
      toast("critical", data.error ?? "라벨을 고치지 못했습니다.");
      return;
    }
    setMails((prev) => prev.map((m) => (m.id === id ? data.mail as MailRecord : m)));
    toast("good", data.mail.gmailLabeled ? "라벨을 고쳤고 Gmail에도 반영했습니다." : "라벨을 고쳤습니다. (Gmail 반영은 실패)");
    void loadAudit();
  }

  /* ---------- 설정 ---------- */
  async function saveSettings(next: Settings) {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: userHeaders(),
      body: JSON.stringify(next),
    });
    const data = (await res.json()) as { settings?: Settings; error?: string };
    if (!res.ok || !data.settings) {
      toast("critical", data.error ?? "설정을 저장하지 못했습니다.");
      throw new Error("save failed");
    }
    setSettings(data.settings);
    setSettingsInfo((info) => (info ? { ...info, settings: data.settings as Settings } : info));
    toast("good", "설정을 저장했습니다.");
    void loadAudit();
  }

  async function disconnectGoogle() {
    await fetch("/api/google/disconnect", { method: "POST", headers: userHeaders() });
    toast("info", "구글 연결을 끊었습니다.");
    await Promise.all([loadSettingsInfo(), loadServerTasks(), loadAudit()]);
  }

  /* ---------- 사이드바 숫자 ---------- */
  const open = tasks.filter((t) => t.status !== "완료");
  const overdue = open.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate) && t.dueDate < today).length;
  const nav: NavItem[] = [
    { key: "overview", label: "대시보드" },
    { key: "inbox", label: "새로 들어온 것", count: tasks.filter((t) => t.status === "미처리").length },
    { key: "calendar", label: "일정", count: open.filter((t) => !t.slot).length },
    { key: "flow", label: "진행 상황", count: overdue, tone: "critical" },
    { key: "mail", label: "메일함", count: mails.filter((m) => m.actionable).length },
    { key: "settings", label: "설정" },
  ];

  const chips: { label: string; tone: "good" | "warn" | "muted"; onClick?: () => void }[] = [];
  if (integrations) {
    chips.push(
      integrations.구글
        ? { label: "구글 연결됨", tone: "good", onClick: () => setTab("settings") }
        : { label: "구글 미연결", tone: "warn", onClick: () => setTab("settings") },
    );
    if (integrations.디스코드) {
      chips.push({
        label:
          integrations.디스코드_모드 === "off"
            ? "디스코드 📌만"
            : `디스코드 ${integrations.디스코드_모드 === "picked" ? "고른 채널" : "전체"}`,
        tone: "good",
        onClick: () => setTab("settings"),
      });
    }
    /*
     * 상한에 가까워지면 알려 준다. 다 쓴 뒤에 "왜 안 들어오지"로 헤매는 것보다
     * 미리 보이는 편이 낫다. 여유가 있을 때는 굳이 띄우지 않는다.
     */
    const 상한 = integrations.AI_상한 ?? 0;
    const 오늘 = integrations.AI_오늘 ?? 0;
    if (상한 > 0 && 오늘 >= 상한 * 0.8) {
      chips.push({
        label: 오늘 >= 상한 ? `AI 상한 도달 ${오늘}/${상한}` : `AI ${오늘}/${상한}`,
        tone: "warn",
        onClick: () => setTab("settings"),
      });
    }
    if (integrations.저장소 !== "redis") chips.push({ label: "저장소 없음", tone: "warn", onClick: () => setTab("settings") });
    if (demo) chips.push({ label: `데모 모드${demoReason ? ` · ${demoReason}` : ""}`, tone: "warn" });
  }

  return (
    <TeamProvider value={settings.team}>
      <AppShell
        tab={tab}
        onTab={setTab}
        nav={nav}
        team={settings.team}
        user={user}
        onPickUser={pickUser}
        search={search}
        onSearch={setSearch}
        syncing={syncing || mailSyncing}
        chips={chips}
        companyName={settings.companyName}
      >
        {tab === "overview" && (
          <OverviewView
            tasks={tasks}
            mails={mails}
            audit={audit}
            busy={busy}
            team={settings.team}
            today={today}
            user={user}
            companyName={settings.companyName}
            googleConnected={googleConnected}
            search={search}
            onSelectTask={jumpToTask}
            onStatusChange={(id, status) => updateTask(id, { status })}
            onOpen={setTab}
          />
        )}

        {tab === "mail" && (
          <MailView
            mails={mails}
            tasks={tasks}
            googleConnected={googleConnected}
            googleEmail={integrations?.구글_계정}
            lastSyncAt={lastMailSync}
            syncing={mailSyncing}
            search={search}
            onSync={() => void syncMailNow()}
            onRelabel={relabel}
            onSelectTask={jumpToTask}
            onOpenSettings={() => setTab("settings")}
            today={today}
          />
        )}

        {tab === "settings" && (
          <SettingsView
            info={settingsInfo}
            integrations={integrations}
            syncing={syncing}
            notice={googleNotice ?? null}
            onSave={saveSettings}
            onDisconnectGoogle={disconnectGoogle}
            onRefresh={() => void loadServerTasks()}
          />
        )}

        {tab === "calendar" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h1 className="text-[20px] font-bold tracking-[-0.015em] text-ink">일정</h1>
                <p className="text-[12.5px] text-ink-3">왼쪽 목록을 격자에 끌어다 놓으면 시간이 잡히고, 구글 캘린더에도 올라갑니다.</p>
              </div>
              <div className="flex gap-0.5 rounded-md border border-line bg-surface p-0.5">
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
                    className={`rounded px-3 py-1 text-[12px] transition ${
                      달력보기 === key ? "bg-primary font-medium text-white" : "text-ink-3 hover:bg-sunk"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {달력보기 === "week" ? (
              <WeekView
                tasks={tasks}
                today={today}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
                onSlotChange={setSlot}
                onOpenFlow={() => setTab("flow")}
                busy={busy}
                googleConnected={googleConnected}
                onOpenSettings={() => setTab("settings")}
                onRangeChange={(from, to) => {
                  rangeRef.current = { from, to };
                  void loadBusy();
                }}
              />
            ) : (
              <MonthView
                tasks={tasks}
                today={today}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
                onOpenWeek={() => set달력보기("week")}
              />
            )}
          </div>
        )}

        {tab === "flow" && (
          <div className="flex flex-col gap-3">
            <div>
              <h1 className="text-[20px] font-bold tracking-[-0.015em] text-ink">진행 상황</h1>
              <p className="text-[12.5px] text-ink-3">한 건이 어디까지 왔고 왜 아직 안 끝났는지</p>
            </div>
            {tasks.length > 0 && <SummaryStrip tasks={tasks} today={today} />}
            <PlannerView
              tasks={tasks}
              today={today}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
              onStatusChange={(id, status) => updateTask(id, { status })}
              suggestions={suggestions}
              onAssigneeChange={(id, assignee) => updateTask(id, { assignee })}
              onSlotChange={setSlot}
              onOpenFlow={() => undefined}
            />
            <StageView
              tasks={tasks}
              today={today}
              suggestions={suggestions}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
            />
          </div>
        )}

        {tab === "inbox" && (
          <div className="flex flex-col gap-3">
            <div>
              <h1 className="text-[20px] font-bold tracking-[-0.015em] text-ink">새로 들어온 것</h1>
              <p className="text-[12.5px] text-ink-3">뭐가 들어왔고 분류가 맞는지 확인하고, 원문을 직접 붙여넣어 뽑을 수도 있습니다</p>
            </div>
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
                suggestions={suggestions}
                onClear={() => {
                  if (!window.confirm("모든 할일을 지울까요? 세 사람 모두에게서 사라집니다.")) return;
                  if (tasks.some((t) => t.origin === "server")) {
                    void fetch("/api/tasks", { method: "DELETE", headers: userHeaders() }).catch(() => undefined);
                  }
                  setTasks([]);
                  setSelectedId(null);
                }}
              />
            </div>
            <section className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 className="text-[13.5px] font-semibold text-ink">직무별 칸반</h2>
                <p className="text-[11px] text-ink-4">카드를 끌어 상태를 바꾸고, 다른 직무 레인에 놓으면 직무도 함께 바뀝니다</p>
              </div>
              <KanbanBoard tasks={tasks} today={today} selectedId={selectedId} onSelect={selectTask} onMove={moveTask} />
            </section>
          </div>
        )}
      </AppShell>

      <ToastStack items={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </TeamProvider>
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
  source: string;
  status: Status;
  channel: "manual" | "email" | "discord";
  sourceLabel: string;
  rawText: string;
  createdAt: string;
  duplicateOf?: string;
  stageAt?: StageAt;
  slot?: Slot;
  edited?: Task["edited"];
  version?: number;
  updatedAt?: string;
  updatedBy?: string;
  calendarEventId?: string;
  mailId?: string;
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
    slot: t.slot,
    edited: t.edited,
    version: t.version ?? 0,
    updatedAt: t.updatedAt,
    updatedBy: t.updatedBy,
    calendarEventId: t.calendarEventId,
    mailId: t.mailId,
  };
}
