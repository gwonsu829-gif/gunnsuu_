"use client";

import { useMemo, useState } from "react";

import { RoleBadge } from "./Badge";
import { IconCheck, IconGoogle, IconLink, IconSparkle, IconSync, IconX } from "./Icons";
import { formatDue } from "@/lib/dates";
import { MAIL_LABELS } from "@/lib/settings";
import { MailLabel, MailRecord, Task } from "@/lib/types";

interface Props {
  mails: MailRecord[];
  tasks: Task[];
  googleConnected: boolean;
  googleEmail?: string | null;
  lastSyncAt: string | null;
  syncing: boolean;
  search: string;
  onSync: () => void;
  onRelabel: (id: string, labels: MailLabel[]) => Promise<void>;
  onSelectTask: (id: string) => void;
  onOpenSettings: () => void;
  today: string;
}

type Filter = "all" | "actionable" | MailLabel;

function fmtReceived(iso: string, today: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 3600_000);
  const day = kst.toISOString().slice(0, 10);
  const hm = kst.toISOString().slice(11, 16);
  if (day === today) return hm;
  return `${Number(day.slice(5, 7))}/${Number(day.slice(8))} ${hm}`;
}

function senderName(from: string): string {
  const m = from.match(/^"?([^"<]+)"?\s*<.+>$/);
  return (m ? m[1] : from.replace(/<.*>/, "")).trim() || from;
}

/**
 * 메일함.
 *
 * Gmail을 다시 만드는 게 아니다. "무슨 메일이 들어왔고, 어느 직무로 분류됐고,
 * 거기서 무슨 할일이 나왔나"만 본다. 본문은 Gmail에서 본다 — 링크 한 번이면 된다.
 */
export default function MailView({
  mails,
  tasks,
  googleConnected,
  googleEmail,
  lastSyncAt,
  syncing,
  search,
  onSync,
  onRelabel,
  onSelectTask,
  onOpenSettings,
  today,
}: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MailLabel[]>([]);
  const [saving, setSaving] = useState(false);

  const q = search.trim().toLowerCase();
  const list = useMemo(() => {
    return mails
      .filter((m) => {
        if (filter === "actionable") return m.actionable;
        if (filter !== "all") return m.labels.includes(filter);
        return true;
      })
      .filter(
        (m) =>
          !q ||
          m.subject.toLowerCase().includes(q) ||
          m.from.toLowerCase().includes(q) ||
          m.summary.toLowerCase().includes(q),
      );
  }, [mails, filter, q]);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of mails) for (const l of m.labels) c.set(l, (c.get(l) ?? 0) + 1);
    return c;
  }, [mails]);

  const selected = mails.find((m) => m.id === selectedId) ?? null;
  const linked = selected ? tasks.filter((t) => selected.taskIds.includes(t.id)) : [];

  function startEdit() {
    if (!selected) return;
    setDraft(selected.labels);
    setEditing(true);
  }
  async function saveEdit() {
    if (!selected) return;
    setSaving(true);
    try {
      await onRelabel(selected.id, draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!googleConnected) {
    return (
      <section className="card mx-auto max-w-[560px] p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sunk">
          <IconGoogle size={22} />
        </span>
        <h2 className="mt-4 text-[18px] font-bold text-ink">Gmail을 연결하면 메일이 저절로 분류됩니다</h2>
        <p className="mx-auto mt-2 max-w-[44ch] text-[13px] leading-relaxed text-ink-3">
          대표님 계정 하나를 연결하면 새 메일을 읽어 Gemini가 직무별 라벨을 붙이고, 할일을 뽑아
          대시보드에 올립니다. 라벨은 Gmail에도 그대로 붙어서 메일함에서도 필터가 됩니다.
        </p>
        <button
          type="button"
          onClick={onOpenSettings}
          className="mt-5 rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary-hover"
        >
          설정에서 연결하기
        </button>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[20px] font-bold tracking-[-0.015em] text-ink">메일함</h1>
          <p className="text-[12.5px] text-ink-3">
            {googleEmail ?? "연결됨"} ·{" "}
            {lastSyncAt ? `마지막 동기화 ${fmtReceived(lastSyncAt, today)}` : "아직 동기화한 적 없음"} ·
            화면이 열려 있으면 5분마다 자동
          </p>
        </div>
        <button
          type="button"
          onClick={onSync}
          disabled={syncing}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-primary-hover disabled:opacity-50"
        >
          <IconSync size={14} className={syncing ? "animate-spin" : ""} />
          {syncing ? "동기화 중" : "지금 동기화"}
        </button>
      </div>

      {/* 라벨 필터 */}
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
        {(
          [
            ["all", "전체", mails.length],
            ["actionable", "할일 있음", mails.filter((m) => m.actionable).length],
            ...MAIL_LABELS.map((l) => [l, l, counts.get(l) ?? 0] as const),
          ] as [Filter, string, number][]
        ).map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition ${
              filter === key
                ? "border-primary bg-primary text-white"
                : "border-line bg-surface text-ink-2 hover:border-line-strong"
            }`}
          >
            {label}
            <span className={`num text-[10.5px] ${filter === key ? "text-white/70" : "text-ink-4"}`}>{n}</span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)]">
        <section className="card overflow-hidden">
          {list.length === 0 ? (
            <p className="px-5 py-12 text-center text-[12.5px] text-ink-4">
              {mails.length === 0
                ? "아직 분류한 메일이 없습니다. '지금 동기화'를 눌러 보세요."
                : "이 조건에 맞는 메일이 없습니다."}
            </p>
          ) : (
            <ul>
              {list.map((m) => (
                <li
                  key={m.id}
                  onClick={() => {
                    setSelectedId(m.id);
                    setEditing(false);
                  }}
                  className={`cursor-pointer border-b border-line-soft px-4 py-3 last:border-b-0 ${
                    selectedId === m.id ? "bg-accent-soft" : "hover:bg-sunk"
                  }`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-2">
                      {senderName(m.from)}
                    </span>
                    <span className="num shrink-0 text-[11px] text-ink-4">{fmtReceived(m.receivedAt, today)}</span>
                  </div>
                  <p className={`mt-0.5 truncate text-[13px] ${m.actionable ? "font-semibold text-ink" : "text-ink-2"}`}>
                    {m.subject}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-ink-3">{m.summary || m.snippet}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {m.labels.map((l) =>
                      l === "참고" ? (
                        <span key={l} className="rounded border border-line bg-sunk px-1.5 py-0.5 text-[10.5px] text-ink-3">
                          참고
                        </span>
                      ) : (
                        <RoleBadge key={l} role={l} />
                      ),
                    )}
                    {m.taskIds.length > 0 && (
                      <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-medium text-accent">
                        할일 {m.taskIds.length}
                      </span>
                    )}
                    {m.forced.length > 0 && (
                      <span className="text-[10.5px] text-ink-4" title={`키워드 규칙: ${m.forced.join(", ")}`}>
                        규칙
                      </span>
                    )}
                    {!m.gmailLabeled && (
                      <span className="text-[10.5px] text-warn" title="Gmail에 라벨을 붙이지 못했습니다">
                        Gmail 라벨 실패
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 상세 */}
        <section className="card sticky top-[64px] p-5">
          {!selected ? (
            <p className="py-10 text-center text-[12.5px] text-ink-4">메일을 고르면 요약과 할일이 여기 보입니다.</p>
          ) : (
            <>
              <p className="text-[12px] text-ink-3">{selected.from}</p>
              <h2 className="mt-1 text-[15px] font-semibold leading-snug text-ink">{selected.subject}</h2>
              <p className="num mt-1 text-[11.5px] text-ink-4">{fmtReceived(selected.receivedAt, today)}</p>

              <div className="mt-4 rounded-md border border-line bg-sunk p-3">
                <p className="flex items-center gap-1 text-[11px] font-medium text-ink-3">
                  <IconSparkle size={13} /> Gemini 요약
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink">{selected.summary || selected.snippet}</p>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium text-ink-3">라벨</p>
                  {!editing ? (
                    <button type="button" onClick={startEdit} className="text-[11.5px] text-accent hover:underline">
                      고치기
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditing(false)} className="text-[11.5px] text-ink-3">
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveEdit()}
                        disabled={saving || draft.length === 0}
                        className="flex items-center gap-1 text-[11.5px] font-medium text-accent disabled:opacity-50"
                      >
                        <IconCheck size={12} /> 저장
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {editing
                    ? MAIL_LABELS.map((l) => {
                        const on = draft.includes(l);
                        return (
                          <button
                            key={l}
                            type="button"
                            onClick={() =>
                              setDraft((d) => (on ? d.filter((x) => x !== l) : [...d.filter((x) => x !== "참고" || l === "참고"), l]))
                            }
                            className={`rounded-full border px-2.5 py-0.5 text-[11.5px] ${
                              on ? "border-primary bg-primary text-white" : "border-line bg-surface text-ink-2"
                            }`}
                          >
                            {l}
                          </button>
                        );
                      })
                    : selected.labels.map((l) =>
                        l === "참고" ? (
                          <span key={l} className="rounded border border-line bg-sunk px-1.5 py-0.5 text-[11px] text-ink-3">
                            참고 (할일 없음)
                          </span>
                        ) : (
                          <RoleBadge key={l} role={l} />
                        ),
                      )}
                </div>
                <p className="mt-1.5 text-[10.5px] text-ink-4">
                  {selected.classifiedBy === "person"
                    ? "사람이 고친 라벨입니다."
                    : selected.forced.length
                      ? `키워드 규칙이 "${selected.forced.join(", ")}"를 정했고, 나머지는 Gemini가 판단했습니다.`
                      : "Gemini가 판단했습니다."}{" "}
                  {selected.gmailLabeled ? "Gmail에도 같은 라벨이 붙어 있습니다." : "Gmail 라벨은 붙지 않았습니다."}
                </p>
              </div>

              <div className="mt-4">
                <p className="text-[11px] font-medium text-ink-3">이 메일에서 나온 할일</p>
                {linked.length === 0 ? (
                  <p className="mt-1.5 text-[12px] text-ink-4">
                    {selected.actionable ? "할일이 아직 저장소에서 보이지 않습니다." : "할일 없음 — 참고용 메일로 분류됐습니다."}
                  </p>
                ) : (
                  <ul className="mt-1.5 space-y-1.5">
                    {linked.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => onSelectTask(t.id)}
                          className="flex w-full items-center gap-2 rounded-md border border-line px-2.5 py-2 text-left hover:border-accent hover:bg-accent-soft"
                        >
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.status === "완료" ? "bg-good" : t.status === "진행중" ? "bg-accent" : "bg-ink-4"}`} />
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{t.title}</span>
                          <span className="num shrink-0 text-[11px] text-ink-4">
                            {t.dueDate === "미정" ? "기한 미정" : formatDue(t.dueDate)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <a
                href={`https://mail.google.com/mail/u/0/#all/${selected.threadId}`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 flex items-center justify-center gap-1.5 rounded-md border border-line px-3 py-2 text-[12.5px] font-medium text-ink-2 hover:bg-sunk"
              >
                <IconLink size={14} /> Gmail에서 열기
              </a>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="mt-2 flex w-full items-center justify-center gap-1 text-[11.5px] text-ink-4 hover:text-ink"
              >
                <IconX size={12} /> 닫기
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
