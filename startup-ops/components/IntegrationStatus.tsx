"use client";

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
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-500"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${on ? "bg-emerald-500" : "bg-slate-300"}`}
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
  if (!integrations) return null;

  const 저장소켜짐 = integrations.저장소 === "redis";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
      <span className="text-[11px] font-semibold text-slate-600">연동 상태</span>

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
        <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          저장소가 없어 자동 수집분이 유지되지 않습니다
        </span>
      )}

      {integrations.디스코드_채널.length > 0 && (
        <span className="text-[11px] text-slate-400">
          {integrations.디스코드_채널.join(" · ")}
        </span>
      )}

      <button
        type="button"
        onClick={onRefresh}
        disabled={syncing}
        className="ml-auto rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:border-slate-500 hover:text-slate-900 disabled:opacity-50"
      >
        {syncing ? "불러오는 중" : "지금 새로고침"}
      </button>
    </div>
  );
}
