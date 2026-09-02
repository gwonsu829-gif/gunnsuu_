"use client";

import { useEffect, useState } from "react";

import DiscordSection from "./DiscordSettings";
import IntegrationStatus, { Integrations } from "./IntegrationStatus";
import { IconCheck, IconGoogle, IconPlus, IconX } from "./Icons";
import { Avatar } from "./AppShell";
import { MAIL_LABELS, MEMBER_COLORS } from "@/lib/settings";
import { KeywordRule, MailLabel, Settings, TeamMember } from "@/lib/types";

export interface SettingsInfo {
  settings: Settings;
  google: {
    configured: boolean;
    connected: boolean;
    email?: string;
    connectedAt?: string;
    redirectUri: string;
  };
  gemini: { configured: boolean; model: string };
  passcode: boolean;
  storage: "redis" | "memory";
}

interface Props {
  info: SettingsInfo | null;
  integrations: Integrations | null;
  syncing: boolean;
  /** 콜백에서 돌아온 결과 (?google=connected 등) */
  notice: string | null;
  onSave: (settings: Settings) => Promise<void>;
  onDisconnectGoogle: () => Promise<void>;
  onRefresh: () => void;
}

/**
 * 설정.
 *
 * 순서가 곧 설치 순서다: 구글 연결 → AI → 디스코드 → 팀 명단 → 키워드 규칙 → 고급.
 * 처음 세팅하는 사람이 위에서 아래로 내려오면 끝나게 두었다.
 */
export default function SettingsView({
  info,
  integrations,
  syncing,
  notice,
  onSave,
  onDisconnectGoogle,
  onRefresh,
}: Props) {
  const [draft, setDraft] = useState<Settings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  // 서버 값이 바뀌면(다른 사람이 저장) 내가 고치는 중이 아닐 때만 갈아끼운다.
  useEffect(() => {
    if (info && !dirty) setDraft(info.settings);
  }, [info, dirty]);

  function edit(fn: (s: Settings) => Settings) {
    setDraft((d) => (d ? fn(d) : d));
    setDirty(true);
    setSaved(false);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      await onSave(draft);
      setDirty(false);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (!info || !draft) {
    return <p className="py-10 text-center text-[12.5px] text-ink-4">설정을 불러오는 중…</p>;
  }

  const g = info.google;

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[20px] font-bold tracking-[-0.015em] text-ink">설정</h1>
          <p className="text-[12.5px] text-ink-3">세 사람이 같은 설정을 씁니다. 저장하면 바로 모두에게 적용됩니다.</p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary-hover disabled:opacity-40"
        >
          {saved && !dirty ? <IconCheck size={14} /> : null}
          {saving ? "저장 중" : saved && !dirty ? "저장됨" : "변경사항 저장"}
        </button>
      </div>

      {notice && (
        <p className="rounded-md border border-accent-line bg-accent-soft px-4 py-2.5 text-[12.5px] text-accent">{notice}</p>
      )}

      {/* ---------- 1. 구글 ---------- */}
      <section className="card p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface">
            <IconGoogle size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold text-ink">구글 계정 — Gmail 라벨링 · 캘린더 동기화</h2>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">
              계정 하나(대표님)를 연결합니다. 새 메일은 직무별 라벨이 붙고 할일이 뽑히며, 대시보드에서 잡은
              시간은 구글 캘린더에 올라가고 캘린더에서 옮기면 대시보드도 따라옵니다.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {g.connected ? (
                <>
                  <span className="flex items-center gap-1.5 rounded-full border border-good-line bg-good-soft px-2.5 py-1 text-[12px] font-medium text-good">
                    <span className="h-1.5 w-1.5 rounded-full bg-good" /> 연결됨 · {g.email ?? "이메일 확인 안 됨"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("구글 연결을 끊을까요? 메일 분류와 캘린더 동기화가 멈춥니다.")) void onDisconnectGoogle();
                    }}
                    className="rounded-md border border-line px-2.5 py-1 text-[12px] text-ink-2 hover:bg-sunk"
                  >
                    연결 끊기
                  </button>
                </>
              ) : g.configured ? (
                <a
                  href="/api/google/auth"
                  className="flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-primary-hover"
                >
                  <IconGoogle size={14} /> 구글 계정 연결
                </a>
              ) : (
                <span className="rounded-full border border-warn-line bg-warn-soft px-2.5 py-1 text-[12px] text-warn">
                  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 환경변수가 없습니다
                </span>
              )}
            </div>

            <details className="mt-3 text-[12px] text-ink-3">
              <summary className="cursor-pointer select-none text-ink-2">처음 설정할 때 (Google Cloud 콘솔)</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 leading-relaxed">
                <li>Google Cloud 콘솔에서 프로젝트를 만들고 <b>Gmail API</b>와 <b>Google Calendar API</b>를 사용 설정합니다.</li>
                <li>OAuth 동의 화면을 만들고(테스트 사용자에 대표님 계정 추가), <b>OAuth 클라이언트 ID(웹 애플리케이션)</b>를 만듭니다.</li>
                <li>
                  승인된 리디렉션 URI에 다음 주소를 그대로 넣습니다:
                  <code className="ml-1 rounded bg-sunk px-1.5 py-0.5 font-mono text-[11px] text-ink">{g.redirectUri}</code>
                </li>
                <li>클라이언트 ID·비밀번호를 Vercel 환경변수 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET에 넣고 재배포합니다.</li>
                <li>위 "구글 계정 연결"을 누르고 대표님 계정으로 동의합니다.</li>
              </ol>
            </details>
          </div>
        </div>
      </section>

      {/* ---------- 2. AI ---------- */}
      <section className="card p-5">
        <h2 className="text-[14px] font-semibold text-ink">AI</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Lamp
            on={info.gemini.configured}
            label="Gemini (메일 분류·요약)"
            note={info.gemini.configured ? `모델 ${info.gemini.model}` : "GEMINI_API_KEY를 넣고 재배포하세요 (aistudio.google.com/apikey)"}
          />
          <Lamp
            on={Boolean(integrations?.AI)}
            label="할일 추출"
            note={
              integrations?.AI
                ? `${integrations.AI_제공자 === "gemini" ? "Gemini" : "Claude"}로 원문에서 할일을 뽑습니다`
                : "ANTHROPIC_API_KEY 또는 GEMINI_API_KEY가 필요합니다"
            }
          />
        </div>
      </section>

      {/* ---------- 3. 디스코드 ---------- */}
      <DiscordSection
        value={draft.discord}
        onChange={(discord) => edit((s) => ({ ...s, discord }))}
        botConfigured={Boolean(integrations?.디스코드)}
      />

      {/* ---------- 4. 팀 ---------- */}
      <section className="card p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[14px] font-semibold text-ink">팀 명단</h2>
          <p className="text-[11.5px] text-ink-4">담당자 드롭다운과 팀 현황의 기준</p>
        </div>
        <ul className="mt-3 space-y-2">
          {draft.team.map((m, i) => (
            <li key={i} className="flex items-center gap-2">
              <Avatar name={m.name || "?"} color={m.color} />
              <input
                value={m.name}
                onChange={(e) => edit((s) => ({ ...s, team: replaceAt(s.team, i, { ...m, name: e.target.value }) }))}
                placeholder="이름"
                className="w-[120px] rounded-md border border-line px-2.5 py-1.5 text-[13px] focus:border-accent focus:outline-none"
              />
              <input
                value={m.role}
                onChange={(e) => edit((s) => ({ ...s, team: replaceAt(s.team, i, { ...m, role: e.target.value }) }))}
                placeholder="맡은 영역 (예: CS · 마케팅)"
                className="min-w-0 flex-1 rounded-md border border-line px-2.5 py-1.5 text-[13px] focus:border-accent focus:outline-none"
              />
              <div className="flex gap-1">
                {MEMBER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`색 ${c}`}
                    onClick={() => edit((s) => ({ ...s, team: replaceAt(s.team, i, { ...m, color: c }) }))}
                    style={{ backgroundColor: c }}
                    className={`h-4 w-4 rounded-full ${m.color === c ? "ring-2 ring-ink ring-offset-1" : "opacity-60"}`}
                  />
                ))}
              </div>
              <button
                type="button"
                aria-label="삭제"
                onClick={() => edit((s) => ({ ...s, team: s.team.filter((_, j) => j !== i) }))}
                className="rounded p-1 text-ink-4 hover:bg-sunk hover:text-critical"
              >
                <IconX size={14} />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            edit((s) => ({
              ...s,
              team: [...s.team, { name: "", role: "", color: MEMBER_COLORS[s.team.length % MEMBER_COLORS.length] }],
            }))
          }
          className="mt-2 flex items-center gap-1 text-[12px] text-accent hover:underline"
        >
          <IconPlus size={13} /> 사람 추가
        </button>
        <label className="mt-4 block">
          <span className="text-[12px] font-medium text-ink-2">회사 이름</span>
          <input
            value={draft.companyName}
            onChange={(e) => edit((s) => ({ ...s, companyName: e.target.value }))}
            className="mt-1 w-full max-w-[280px] rounded-md border border-line px-2.5 py-1.5 text-[13px] focus:border-accent focus:outline-none"
          />
        </label>
      </section>

      {/* ---------- 5. 키워드 규칙 ---------- */}
      <section className="card p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[14px] font-semibold text-ink">키워드 규칙</h2>
          <p className="text-[11.5px] text-ink-4">이 단어가 보이면 무조건 이 라벨 — AI보다 먼저</p>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
          Gemini가 대부분 맞추지만, 회사에서만 쓰는 말(고객사 이름, 사업 공고 명칭)은 규칙으로 못 박아 두는 게 안전합니다.
          &quot;참고&quot; 라벨 규칙에 걸린 메일은 할일을 만들지 않습니다.
        </p>
        <ul className="mt-3 space-y-2">
          {draft.keywordRules.map((r, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <select
                value={r.label}
                onChange={(e) =>
                  edit((s) => ({ ...s, keywordRules: replaceAt(s.keywordRules, i, { ...r, label: e.target.value as MailLabel }) }))
                }
                className="w-[110px] rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] focus:border-accent focus:outline-none"
              >
                {MAIL_LABELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <input
                value={r.keywords.join(", ")}
                onChange={(e) =>
                  edit((s) => ({
                    ...s,
                    keywordRules: replaceAt(s.keywordRules, i, {
                      ...r,
                      keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean),
                    }),
                  }))
                }
                placeholder="쉼표로 구분: 견적, 제안서, 계약"
                className="min-w-0 flex-1 rounded-md border border-line px-2.5 py-1.5 text-[13px] focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                aria-label="삭제"
                onClick={() => edit((s) => ({ ...s, keywordRules: s.keywordRules.filter((_, j) => j !== i) }))}
                className="rounded p-1 text-ink-4 hover:bg-sunk hover:text-critical"
              >
                <IconX size={14} />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => edit((s) => ({ ...s, keywordRules: [...s.keywordRules, { label: "CS", keywords: [] }] }))}
          className="mt-2 flex items-center gap-1 text-[12px] text-accent hover:underline"
        >
          <IconPlus size={13} /> 규칙 추가
        </button>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px]">
          <label className="block">
            <span className="text-[12px] font-medium text-ink-2">가져올 메일 조건 (Gmail 검색 문법)</span>
            <input
              value={draft.mailQuery}
              onChange={(e) => edit((s) => ({ ...s, mailQuery: e.target.value }))}
              className="mt-1 w-full rounded-md border border-line px-2.5 py-1.5 font-mono text-[12px] focus:border-accent focus:outline-none"
            />
            <span className="mt-1 block text-[11px] text-ink-4">
              예: <code>newer_than:7d -category:promotions</code> · 특정 발신자만 보려면 <code>from:@고객사.com</code>
            </span>
          </label>
          <label className="block">
            <span className="text-[12px] font-medium text-ink-2">Gmail 라벨 접두어</span>
            <input
              value={draft.labelPrefix}
              onChange={(e) => edit((s) => ({ ...s, labelPrefix: e.target.value }))}
              className="mt-1 w-full rounded-md border border-line px-2.5 py-1.5 text-[13px] focus:border-accent focus:outline-none"
            />
            <span className="mt-1 block text-[11px] text-ink-4">→ {draft.labelPrefix || "업무"}/CS 처럼 붙습니다</span>
          </label>
        </div>
      </section>

      {/* ---------- 6. 접근·저장소 ---------- */}
      <section className="card p-5">
        <h2 className="text-[14px] font-semibold text-ink">접근과 저장소</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Lamp
            on={info.passcode}
            label="팀 접근코드"
            note={info.passcode ? "APP_PASSCODE로 잠겨 있습니다" : "APP_PASSCODE가 없어 누구나 열 수 있습니다. 배포에서는 꼭 넣으세요."}
          />
          <Lamp
            on={info.storage === "redis"}
            label="저장소"
            note={info.storage === "redis" ? "Upstash Redis — 세 사람이 같은 데이터를 봅니다" : "메모리 — 서버가 쉬면 사라집니다. Redis를 붙이세요."}
          />
        </div>
      </section>

      {/* ---------- 7. 고급 ---------- */}
      <section className="card p-5">
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span>
            <span className="text-[14px] font-semibold text-ink">고급 연동</span>
            <span className="ml-2 text-[12px] text-ink-4">지금 수집 · 메일 웹훅 · 아침 요약 · 정확도 측정</span>
          </span>
          <span className="text-[12px] text-ink-3">{advanced ? "접기" : "펼치기"}</span>
        </button>
        {advanced && (
          <div className="mt-3">
            <IntegrationStatus integrations={integrations} syncing={syncing} onRefresh={onRefresh} onClose={() => setAdvanced(false)} />
          </div>
        )}
      </section>
    </div>
  );
}

function replaceAt<T>(arr: T[], i: number, v: T): T[] {
  return arr.map((x, j) => (j === i ? v : x));
}

function Lamp({ on, label, note }: { on: boolean; label: string; note?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-line px-3 py-2.5">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${on ? "bg-good" : "bg-warn"}`} />
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium text-ink">{label}</p>
        {note && <p className="mt-0.5 text-[11px] leading-snug text-ink-3">{note}</p>}
      </div>
    </div>
  );
}

export type { KeywordRule, TeamMember };
