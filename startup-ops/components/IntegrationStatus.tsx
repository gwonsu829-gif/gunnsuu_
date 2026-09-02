"use client";

import { useState } from "react";

export interface Integrations {
  저장소: "redis" | "memory";
  메일: boolean;
  디스코드: boolean;
  디스코드_채널?: string[];
  디스코드_모드?: "all" | "picked" | "off";
  디스코드_콕집기?: string | null;
  AI: boolean;
  AI_제공자?: "anthropic" | "gemini" | null;
  구글?: boolean;
  구글_계정?: string | null;
  구글_설정됨?: boolean;
}

function Lamp({ on, label, note }: { on: boolean; label: string; note?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-line bg-surface px-2.5 py-2">
      <span
        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
          on ? "bg-good" : "bg-line-strong"
        }`}
      />
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[12px] font-medium text-ink">{label}</span>
          <span
            className={`text-[10.5px] ${on ? "text-good" : "text-ink-4"}`}
          >
            {on ? "연결됨" : "미설정"}
          </span>
        </div>
        {note && (
          <p className="mt-0.5 truncate text-[10.5px] text-ink-4" title={note}>
            {note}
          </p>
        )}
      </div>
    </div>
  );
}

interface EvalReport {
  실행일: string;
  건수: { 정답: number; 잡음: number; 놓침: number; 오탐: number };
  재현율: string;
  정밀도: string;
  마감일_정확도: string;
  직무_정확도: string;
  사례별: {
    원문: string;
    정답: number;
    잡음: number;
    놓침: string[];
    오탐: string[];
    뽑은_할일: string[];
    틀린_직무: string[];
    틀린_마감: string[];
    오류?: string;
  }[];
}

export default function IntegrationStatus({
  integrations,
  syncing,
  onRefresh,
  onClose,
}: {
  integrations: Integrations | null;
  syncing: boolean;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const [evalReport, setEvalReport] = useState<EvalReport | null>(null);

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

  /**
   * 정답지를 돌려 추출 정확도를 잰다.
   * 만든 사람이 "잘 됩니다"라고 말하는 것과 숫자를 내놓는 것은 다르다.
   */
  async function runEval() {
    setTesting(true);
    setTestResult(null);
    setEvalReport(null);
    try {
      const res = await fetch("/api/eval", { method: "POST" });
      const data = (await res.json()) as EvalReport & { error?: string };
      if (!res.ok) {
        setTestResult(data.error ?? "측정 실패");
        return;
      }
      setEvalReport(data);
    } catch {
      setTestResult("측정 요청을 보내지 못했습니다.");
    } finally {
      setTesting(false);
    }
  }

  /** 크론을 기다리지 않고 지금 디스코드를 훑는다. */
  async function collectDiscord() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/discord/sync?force=1", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        건너뜀?: string;
        대상채널?: number;
        채널별?: {
          채널: string;
          새_메시지: number;
          추가된_할일?: number;
          콕집은_할일?: number;
          건너뜀?: string;
          오류?: string;
        }[];
      };
      if (!res.ok || !data.채널별) {
        setTestResult(data.error ?? "수집 실패");
        return;
      }
      if (data.건너뜀) {
        setTestResult(data.건너뜀);
        return;
      }
      const 움직인것 = data.채널별.filter(
        (c) => c.오류 || c.추가된_할일 || c.콕집은_할일 || c.새_메시지,
      );
      setTestResult(
        움직인것.length === 0
          ? `채널 ${data.대상채널 ?? 0}곳을 봤지만 새 대화가 없습니다.`
          : 움직인것
              .map((c) => {
                if (c.오류) return `${c.채널}: ${c.오류}`;
                const 조각 = [];
                if (c.새_메시지) 조각.push(`메시지 ${c.새_메시지}건`);
                if (c.추가된_할일) 조각.push(`할일 ${c.추가된_할일}건`);
                if (c.콕집은_할일) 조각.push(`콕집기 ${c.콕집은_할일}건`);
                if (c.건너뜀) 조각.push(c.건너뜀);
                return `${c.채널}: ${조각.join(" → ") || "변화 없음"}`;
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


  /** 도구 버튼 하나. 이름만으로는 뭐가 나오는지 모르니 한 줄 설명을 같이 붙인다. */
  function Tool({
    label,
    desc,
    busyLabel,
    onClick,
    disabled,
  }: {
    label: string;
    desc: string;
    busyLabel?: string;
    onClick: () => void;
    disabled?: boolean;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex flex-col items-start gap-0.5 rounded-md border border-line bg-surface px-3 py-2 text-left transition hover:border-accent-line hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="text-[12px] font-medium text-ink">
          {disabled && busyLabel ? busyLabel : label}
        </span>
        <span className="text-[10.5px] leading-tight text-ink-4">{desc}</span>
      </button>
    );
  }

  return (
    <div className="drop-in rounded-lg border border-line bg-sunk p-3 shadow-card sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold text-ink">설정과 도구</h2>
          <p className="mt-0.5 text-[11px] text-ink-3">
            평소에는 볼 일이 없습니다. 수집이 안 될 때 여기부터 확인하세요.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink-3 hover:text-ink"
        >
          닫기
        </button>
      </div>

      <p className="mb-1.5 text-[11px] font-medium text-ink-2">연동 상태</p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        <Lamp on={integrations.AI} label="AI 추출" note="ANTHROPIC_API_KEY" />
        <Lamp on={integrations.메일} label="메일 수신" note="INGEST_SECRET" />
        <Lamp
          on={integrations.디스코드}
          label="디스코드"
          note={
            integrations.디스코드
              ? `${
                  integrations.디스코드_모드 === "picked"
                    ? "고른 채널"
                    : integrations.디스코드_모드 === "off"
                      ? "자동 수집 꺼짐"
                      : "모든 채널"
                }${integrations.디스코드_콕집기 ? ` · ${integrations.디스코드_콕집기} 콕집기` : ""}`
              : "DISCORD_BOT_TOKEN이 없습니다"
          }
        />
        <Lamp
          on={저장소켜짐}
          label="저장소"
          note={
            저장소켜짐
              ? "Redis에 저장됩니다"
              : "미설정 — 자동 수집분이 유지되지 않습니다"
          }
        />
      </div>

      {!저장소켜짐 && (
        <p className="mt-2 rounded-md border border-warn-line bg-warn-soft px-2.5 py-1.5 text-[11px] text-warn">
          저장소가 없어 자동 수집분이 새로고침하면 사라집니다.
        </p>
      )}

      <p className="mb-1.5 mt-4 text-[11px] font-medium text-ink-2">도구</p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        <Tool
          label="지금 새로고침"
          busyLabel="불러오는 중"
          desc="저장된 할일을 다시 읽습니다"
          onClick={onRefresh}
          disabled={syncing}
        />
        {integrations.디스코드 && (
          <Tool
            label="디스코드 지금 수집"
            busyLabel="수집 중"
            desc="크론을 기다리지 않고 지금 훑습니다"
            onClick={() => void collectDiscord()}
            disabled={testing}
          />
        )}
        {integrations.메일 && (
          <Tool
            label="아침 요약 보기"
            desc="내일 아침에 나갈 내용을 미리 봅니다"
            onClick={() => void runDigest(false)}
            disabled={testing}
          />
        )}
        {integrations.메일 && (
          <Tool
            label="메일 수신 테스트"
            busyLabel="보내는 중"
            desc="메일 1통이 들어온 상황을 흉내냅니다"
            onClick={() => void runTest()}
            disabled={testing}
          />
        )}
        {integrations.AI && (
          <Tool
            label="정확도 측정"
            busyLabel="측정 중"
            desc="정답지를 돌려 추출 정확도를 잽니다"
            onClick={() => void runEval()}
            disabled={testing}
          />
        )}
      </div>

      {testResult && (
        <p className="mt-2.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11.5px] text-ink-2">
          {testResult}
        </p>
      )}

      {evalReport && (
        <div className="mt-2.5 rounded-md border border-line bg-surface p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11.5px] font-semibold text-ink">
              추출 정확도 · {evalReport.실행일} 측정
            </span>
            <button
              type="button"
              onClick={() => setEvalReport(null)}
              className="rounded px-1.5 py-0.5 text-[11px] text-ink-4 hover:text-ink-2"
            >
              닫기
            </button>
          </div>

          <div className="mb-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {[
              ["재현율", evalReport.재현율, "정답 할일 중 잡아낸 비율"],
              ["정밀도", evalReport.정밀도, "잡아낸 것 중 진짜인 비율"],
              ["마감일", evalReport.마감일_정확도, "상대 표현을 날짜로 옳게 바꾼 비율"],
              ["직무", evalReport.직무_정확도, "직무 분류가 맞은 비율"],
            ].map(([label, value, note]) => (
              <div
                key={label}
                title={note}
                className="rounded-md border border-line bg-sunk px-2 py-1.5"
              >
                <div className="text-[10px] text-ink-4">{label}</div>
                <div className="font-mono text-[13px] tabular-nums text-ink">
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div className="thin-scroll max-h-72 overflow-auto">
            <table className="w-full min-w-[520px] text-left text-[11px]">
              <thead className="text-ink-4">
                <tr className="border-b border-line">
                  <th className="py-1 pr-2 font-medium">원문</th>
                  <th className="py-1 pr-2 font-medium">정답</th>
                  <th className="py-1 pr-2 font-medium">놓침</th>
                  <th className="py-1 font-medium">잘못 만든 것</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft text-ink-2">
                {evalReport.사례별.map((c) => {
                  const 흠 = [
                    ...c.틀린_직무.map((x) => `직무 — ${x}`),
                    ...c.틀린_마감.map((x) => `마감 — ${x}`),
                  ];
                  return (
                    <tr key={c.원문} className="align-top">
                      <td className="py-1 pr-2">
                        {c.원문}
                        {/* 무엇이 뽑혔는지 그대로 보여야 어디서 틀렸는지 안다 */}
                        <ul className="mt-0.5 space-y-0.5 text-[10px] text-ink-4">
                          {c.뽑은_할일.map((t) => (
                            <li key={t}>· {t}</li>
                          ))}
                          {흠.map((x) => (
                            <li key={x} className="text-warn">
                              · {x}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="py-1 pr-2 font-mono tabular-nums">
                        {c.잡음}/{c.정답}
                      </td>
                      <td className="py-1 pr-2 text-critical">
                        {c.오류 ?? (c.놓침.length ? c.놓침.join(", ") : "—")}
                      </td>
                      <td className="py-1 text-warn">
                        {c.오탐.length ? c.오탐.join(", ") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-[10.5px] leading-relaxed text-ink-4">
            사람이 미리 정답을 적어둔 메일·디스코드 원문 {evalReport.사례별.length}건을
            실제로 추출해 대조한 결과입니다. 마감일은 &ldquo;이번 주 금요일&rdquo; 같은 상대
            표현을 측정일 기준으로 계산해 비교합니다.
          </p>
        </div>
      )}

      {digest && (
        <div className="mt-2.5 rounded-md border border-line bg-surface p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[11.5px] font-semibold text-ink">
              아침에 나갈 내용
            </span>
            <div className="flex items-center gap-1">
              {integrations.디스코드 && (
                <button
                  type="button"
                  onClick={() => void runDigest(true)}
                  disabled={testing}
                  className="rounded-md border border-line-strong bg-surface px-2 py-0.5 text-[11px] text-ink-2 hover:border-ink-4 disabled:opacity-50"
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
    </div>
  );
}
