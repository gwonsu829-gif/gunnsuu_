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
  usage?: {
    today: { calls: number; collect: number; pin: number; manual: number };
    recent: { day: string; usage: { calls: number } }[];
  };
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
 * 순서가 곧 설치 순서다: 구글 연결 → AI → 사용량 → 디스코드 → 팀 명단 → 키워드 규칙 → 고급.
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

      {/* ---------- 3. 사용량과 상한 ---------- */}
      <section className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[14px] font-semibold text-ink">AI 사용량과 상한</h2>
          <p className="text-[11.5px] text-ink-4">요금이 새어 나가지 않게 하는 곳</p>
        </div>

        {(() => {
          const today = info.usage?.today.calls ?? 0;
          const limit = draft.aiDailyLimit;
          const ratio = limit > 0 ? Math.min(1, today / limit) : 0;
          const tone = ratio >= 1 ? "#c2372f" : ratio >= 0.8 ? "#9a6200" : "#1a8a53";
          return (
            <>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="num text-[26px] font-semibold leading-none tracking-[-0.02em] text-ink">
                  {today}
                </span>
                <span className="text-[12px] text-ink-3">
                  {limit > 0 ? `/ ${limit}회 · 오늘 자동 수집이 쓴 AI 호출` : "회 · 오늘 쓴 AI 호출 (상한 없음)"}
                </span>
              </div>
              {limit > 0 && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunk">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${ratio * 100}%`, backgroundColor: tone }}
                  />
                </div>
              )}
              {info.usage && (
                <p className="mt-1.5 text-[11px] text-ink-4">
                  수집 {info.usage.today.collect} · 콕집기 {info.usage.today.pin} · 붙여넣기{" "}
                  {info.usage.today.manual}
                  {info.usage.recent.length > 1 && (
                    <>
                      {" · "}지난 7일 합계{" "}
                      <span className="num">
                        {info.usage.recent.reduce((n, d) => n + d.usage.calls, 0)}
                      </span>
                    </>
                  )}
                </p>
              )}
            </>
          );
        })()}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[12px] font-medium text-ink-2">하루 상한 (회)</span>
            <input
              type="number"
              min={0}
              max={5000}
              value={draft.aiDailyLimit}
              onChange={(e) => edit((s) => ({ ...s, aiDailyLimit: Number(e.target.value) }))}
              className="num mt-1 w-full rounded-md border border-line px-2.5 py-1.5 text-[13px] focus:border-accent focus:outline-none"
            />
            <span className="mt-1 block text-[11px] leading-snug text-ink-4">
              닿으면 자동 수집이 멈추고 <b>다음 날 이어서</b> 읽습니다. 원문은 그대로 남아 사라지는 할일이
              없습니다. 📌로 콕 집은 것과 직접 붙여넣기는 상한 밖입니다. 0이면 상한 없음.
            </span>
          </label>
          <label className="block">
            <span className="text-[12px] font-medium text-ink-2">자동 수집 간격 (분)</span>
            <input
              type="number"
              min={1}
              max={720}
              value={draft.syncMinutes}
              onChange={(e) => edit((s) => ({ ...s, syncMinutes: Number(e.target.value) }))}
              className="num mt-1 w-full rounded-md border border-line px-2.5 py-1.5 text-[13px] focus:border-accent focus:outline-none"
            />
            <span className="mt-1 block text-[11px] leading-snug text-ink-4">
              화면이 열려 있을 때 메일·디스코드를 다시 보는 간격입니다. 길게 둘수록 호출이 줍니다.
              새 대화가 없으면 AI를 부르지 않으므로, 조용한 날은 0회입니다.
            </span>
          </label>
        </div>

        <details className="mt-3 text-[12px] text-ink-3">
          <summary className="cursor-pointer select-none text-ink-2">돈 안 들게 쓰는 법</summary>
          <div className="mt-2 space-y-2 leading-relaxed">
            <p>
              <b className="text-ink">디스코드 봇은 원래 무료입니다.</b> 개발자 포털도, 봇도, API도 요금이
              없습니다. 상시 서버도 필요 없습니다 — 이 대시보드가 주기적으로 읽어가는 방식이라서요.
            </p>
            <p>
              돈이 드는 건 <b className="text-ink">AI 호출뿐</b>입니다. Gemini는 Flash 계열에 무료 등급이
              있어서, <code className="rounded bg-sunk px-1 py-0.5 font-mono text-[11px]">GEMINI_API_KEY</code>만
              넣고 <code className="rounded bg-sunk px-1 py-0.5 font-mono text-[11px]">ANTHROPIC_API_KEY</code>를
              비워 두면 0원으로 돌릴 수 있습니다. 위 상한을 무료 등급 한도 아래로 잡아 두면 초과가 구조적으로
              불가능합니다. (한도는 AI Studio의 Rate limit 화면에서 확인하세요)
            </p>
            <p className="rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-warn">
              <b>무료 등급의 대가는 데이터입니다.</b> 구글 약관상 무료 등급은 보낸 내용과 응답을 제품 개선에
              쓸 수 있고 사람이 검토할 수도 있습니다. 유료 등급은 그러지 않습니다. 우리는 고객 메일과 사내
              대화를 넣으므로, 이건 대표님이 알고 정해야 하는 문제입니다.
            </p>
            <p>
              유료로 가더라도 3인 팀 사용량은 작습니다. 호출을 더 줄이려면 — 디스코드를{" "}
              <b className="text-ink">&quot;자동 수집 끔 + 📌&quot;</b>로 두면 누가 반응을 붙일 때만 AI가
              돕니다. 간격을 30분으로 늘리고, 메일 조건(위 키워드 규칙 항목)을 좁히는 것도 바로 듣습니다.
            </p>
          </div>
        </details>
      </section>

      {/* ---------- 4. 디스코드 ---------- */}
      <DiscordSection
        value={draft.discord}
        onChange={(discord) => edit((s) => ({ ...s, discord }))}
        botConfigured={Boolean(integrations?.디스코드)}
      />

      {/* ---------- 5. 팀 ---------- */}
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

      {/* ---------- 6. 키워드 규칙 ---------- */}
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

      {/* ---------- 7. 접근·저장소 ---------- */}
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

      {/* ---------- 8. 고급 ---------- */}
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
