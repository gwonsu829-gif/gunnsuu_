"use client";

import { useState } from "react";

export interface Integrations {
  저장소: "redis" | "memory";
  메일: boolean;
  디스코드: boolean;
  디스코드_채널: string[];
  AI: boolean;
}

function Lamp({ on, label, note }: { on: boolean; label: string; note?: string }) {
  return (
    <span
      title={note}
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] ${
        on
          ? "border-good-line bg-good-soft text-good"
          : "border-line bg-sunk text-ink-3"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${on ? "bg-good-soft0" : "bg-line-strong"}`}
      />
      <span className="font-medium">{label}</span>
      <span className="text-[10px] opacity-80">{on ? "연결됨" : "미설정"}</span>
    </span>
  );
}

export default function IntegrationStatus({
  integrations,
  syncing,
  onRefresh,
}: {
  integrations: Integrations | null;
  syncing: boolean;
  onRefresh: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [digest, setDigest] = useState<string | null>(null);

  if (!integrations) return null;

  const 저장소켜짐 = integrations.저장소 === "redis";

  /** 아침에 나갈 요약을 지금 확인하거나 보낸다. */
  async function runDigest(send: boolean) {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/digest/run${send ? "?send=1" : ""}`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        본문?: string;
        전송?: string;
        error?: string;
        안내?: string;
      };
      if (data.본문) setDigest(data.본문);
      if (!res.ok) {
        setTestResult(`${data.error ?? "실패"}${data.안내 ? ` — ${data.안내}` : ""}`);
      } else if (send) {
        setTestResult("디스코드로 보냈습니다");
      }
    } catch {
      setTestResult("요청을 보내지 못했습니다.");
    } finally {
      setTesting(false);
    }
  }

  /** 크론을 기다리지 않고 지금 디스코드를 훑는다. */
  async function collectDiscord() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ingest/discord/run", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        채널별?: {
          채널: string;
          새_메시지: number;
          추가된_할일?: number;
          건너뜀?: string;
          오류?: string;
        }[];
      };
      if (!res.ok || !data.채널별) {
        setTestResult(data.error ?? "수집 실패");
        return;
      }
      setTestResult(
        data.채널별
          .map((c) => {
            if (c.오류) return `${c.채널}: ${c.오류}`;
            if (c.건너뜀) return `${c.채널}: ${c.건너뜀}`;
            if (!c.새_메시지) return `${c.채널}: 새 메시지 없음`;
            return `${c.채널}: 메시지 ${c.새_메시지}건 → 할일 ${c.추가된_할일 ?? 0}건`;
          })
          .join(" / "),
      );
      onRefresh();
    } catch {
      setTestResult("수집 요청을 보내지 못했습니다.");
    } finally {
      setTesting(false);
    }
  }

  /** 메일 전달 서비스를 붙이기 전에 수집 경로 전체가 이어지는지 확인한다. */
  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ingest/test", { method: "POST" });
      const data = (await res.json()) as {
        added?: number;
        duplicates?: number;
        skipReason?: string;
        error?: string;
      };
      if (!res.ok) {
        setTestResult(data.error ?? "테스트 실패");
      } else if (data.skipReason) {
        setTestResult(`건너뜀 — ${data.skipReason}`);
      } else {
        setTestResult(
          `메일 1통 수신 → 할일 ${data.added}건 추가` +
            (data.duplicates ? ` (중복 의심 ${data.duplicates}건)` : ""),
        );
        onRefresh();
      }
    } catch {
      setTestResult("테스트 요청을 보내지 못했습니다.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface px-3 py-2">
      <span className="text-[11px] font-semibold text-ink-2">연동 상태</span>

      <Lamp on={integrations.AI} label="AI 추출" note="ANTHROPIC_API_KEY" />
      <Lamp on={integrations.메일} label="메일 수신" note="INGEST_SECRET" />
      <Lamp
        on={integrations.디스코드}
        label="디스코드"
        note={
          integrations.디스코드_채널.length
            ? integrations.디스코드_채널.join(", ")
            : "DISCORD_BOT_TOKEN + DISCORD_CHANNELS"
        }
      />
      <Lamp
        on={저장소켜짐}
        label="저장소"
        note={
          저장소켜짐
            ? "Redis에 저장됩니다"
            : "저장소 미설정 — 자동 수집분이 유지되지 않습니다"
        }
      />

      {!저장소켜짐 && (
        <span className="rounded border border-warn-line bg-warn-soft px-2 py-1 text-[11px] text-warn">
          저장소가 없어 자동 수집분이 유지되지 않습니다
        </span>
      )}

      {integrations.디스코드_채널.length > 0 && (
        <span className="text-[11px] text-ink-4">
          {integrations.디스코드_채널.join(" · ")}
        </span>
      )}

      {testResult && (
        <span className="max-w-full rounded border border-line bg-sunk px-2 py-1 text-[11px] text-ink-2">
          {testResult}
        </span>
      )}

      {digest && (
        <div className="order-last w-full rounded border border-line bg-sunk p-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-ink-2">
              아침에 나갈 내용
            </span>
            <div className="flex items-center gap-1">
              {integrations.디스코드 && (
                <button
                  type="button"
                  onClick={() => void runDigest(true)}
                  disabled={testing}
                  className="rounded border border-line-strong bg-surface px-1.5 py-0.5 text-[11px] text-ink-2 hover:border-ink-4 disabled:opacity-50"
                >
                  지금 디스코드로 보내기
                </button>
              )}
              <button
                type="button"
                onClick={() => setDigest(null)}
                className="rounded px-1.5 py-0.5 text-[11px] text-ink-4 hover:text-ink-2"
              >
                닫기
              </button>
            </div>
          </div>
          <pre className="thin-scroll max-h-56 overflow-auto whitespace-pre-wrap break-words font-sans text-[11.5px] leading-relaxed text-ink-2">
            {digest}
          </pre>
        </div>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {integrations.메일 && (
          <button
            type="button"
            onClick={() => void runDigest(false)}
            disabled={testing}
            title="아침에 나갈 요약을 지금 확인합니다"
            className="rounded border border-line-strong px-2 py-1 text-[11px] text-ink-2 hover:border-ink-4 hover:text-ink disabled:opacity-50"
          >
            아침 요약 보기
          </button>
        )}
        {integrations.디스코드 && (
          <button
            type="button"
            onClick={() => void collectDiscord()}
            disabled={testing}
            title="크론을 기다리지 않고 지금 채널을 훑습니다"
            className="rounded border border-line-strong px-2 py-1 text-[11px] text-ink-2 hover:border-ink-4 hover:text-ink disabled:opacity-50"
          >
            {testing ? "수집 중" : "디스코드 지금 수집"}
          </button>
        )}
        {integrations.메일 && (
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={testing}
            title="메일이 들어온 상황을 흉내내 수집 경로 전체를 확인합니다"
            className="rounded border border-line-strong px-2 py-1 text-[11px] text-ink-2 hover:border-ink-4 hover:text-ink disabled:opacity-50"
          >
            {testing ? "보내는 중" : "메일 수신 테스트"}
          </button>
        )}
        <button
          type="button"
          onClick={onRefresh}
          disabled={syncing}
          className="rounded border border-line-strong px-2 py-1 text-[11px] text-ink-2 hover:border-ink-4 hover:text-ink disabled:opacity-50"
        >
          {syncing ? "불러오는 중" : "지금 새로고침"}
        </button>
      </div>
    </div>
  );
}
