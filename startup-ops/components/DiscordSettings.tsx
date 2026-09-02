"use client";

import { useCallback, useEffect, useState } from "react";

import { IconCheck, IconSync } from "./Icons";
import { DiscordChannelInfo, DiscordGuildInfo, DiscordSettings } from "@/lib/types";

interface Props {
  value: DiscordSettings;
  onChange: (next: DiscordSettings) => void;
  botConfigured: boolean;
}

interface Loaded {
  configured: boolean;
  error?: string;
  guilds: DiscordGuildInfo[];
  guildId?: string;
  channels: DiscordChannelInfo[];
}

const MODES: { key: DiscordSettings["mode"]; label: string; desc: string }[] = [
  {
    key: "all",
    label: "모든 채널",
    desc: "봇이 읽을 수 있는 채널 전부. 새 채널이 생겨도 저절로 잡힙니다",
  },
  { key: "picked", label: "고른 채널만", desc: "아래에서 고른 채널만 봅니다" },
  { key: "off", label: "자동 수집 끔", desc: "📌로 콕 집은 것만 들어옵니다" },
];

const EMOJI_CHOICES = ["📌", "✅", "📝", "🔥", "⭐"];

/**
 * 디스코드 설정.
 *
 * 예전에는 채널 ID를 환경변수에 적고 재배포해야 했다. 봇이 이미 서버에 들어가 있으면
 * 채널 목록은 봇이 스스로 아는 정보라, 사람이 개발자 모드를 켜고 ID를 복사할 이유가 없다.
 * 여기서 목록을 불러와 이름으로 고르고, 저장하면 바로 적용된다.
 */
export default function DiscordSection({ value, onChange, botConfigured }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(
    async (guild?: string) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/discord${guild ? `?guild=${guild}` : ""}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as Loaded;
        setLoaded(data);
        // 화면이 이름을 바로 보여줄 수 있도록 설정에 캐시해 둔다 (수집은 매번 실제 목록을 다시 읽는다).
        if (data.channels?.length) {
          onChange({
            ...value,
            guildId: data.guildId ?? value.guildId,
            knownChannels: data.channels,
          });
        }
      } catch {
        setLoaded({ configured: true, error: "목록을 불러오지 못했습니다.", guilds: [], channels: [] });
      } finally {
        setLoading(false);
      }
    },
    // value를 넣으면 불러올 때마다 다시 만들어져 무한 루프가 된다. 최신 값은 클로저로 충분하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // 봇이 설정돼 있는데 아직 채널을 본 적이 없으면 한 번 불러온다.
  useEffect(() => {
    if (botConfigured && !loaded && value.knownChannels.length === 0) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botConfigured]);

  async function collectNow() {
    setCollecting(true);
    setResult(null);
    try {
      const res = await fetch("/api/discord/sync?force=1", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        건너뜀?: string;
        대상채널?: number;
        채널별?: { 채널: string; 새_메시지: number; 추가된_할일?: number; 콕집은_할일?: number; 오류?: string }[];
      };
      if (!res.ok) {
        setResult(data.error ?? "수집하지 못했습니다.");
        return;
      }
      if (data.건너뜀) {
        setResult(data.건너뜀);
        return;
      }
      const 할일 = (data.채널별 ?? []).reduce(
        (n, c) => n + (c.추가된_할일 ?? 0) + (c.콕집은_할일 ?? 0),
        0,
      );
      const 오류 = (data.채널별 ?? []).filter((c) => c.오류);
      setResult(
        `채널 ${data.대상채널 ?? 0}곳 확인 · 할일 ${할일}건 추가` +
          (오류.length ? ` · ${오류.length}곳에서 오류 (${오류[0].오류?.slice(0, 60)})` : ""),
      );
    } catch {
      setResult("서버에 닿지 못했습니다.");
    } finally {
      setCollecting(false);
    }
  }

  const channels = loaded?.channels?.length ? loaded.channels : value.knownChannels;
  const grouped = new Map<string, DiscordChannelInfo[]>();
  for (const c of channels) {
    const key = c.category || "카테고리 없음";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(c);
  }

  const included = (c: DiscordChannelInfo) =>
    value.mode === "picked" ? value.channels.includes(c.id) : !value.excluded.includes(c.id);

  function toggle(c: DiscordChannelInfo) {
    if (value.mode === "picked") {
      const on = value.channels.includes(c.id);
      onChange({
        ...value,
        channels: on ? value.channels.filter((x) => x !== c.id) : [...value.channels, c.id],
      });
    } else {
      const off = value.excluded.includes(c.id);
      onChange({
        ...value,
        excluded: off ? value.excluded.filter((x) => x !== c.id) : [...value.excluded, c.id],
      });
    }
  }

  const 대상수 = channels.filter(included).length;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-ink">디스코드</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">
            채널 ID를 환경변수에 넣을 필요가 없습니다. 봇 토큰만 있으면 서버와 채널을 여기서 불러와
            이름으로 고릅니다. 스레드는 고른 채널을 따라 자동으로 함께 봅니다.
          </p>
        </div>
        {botConfigured && (
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={() => void load(loaded?.guildId)}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-sunk disabled:opacity-50"
            >
              <IconSync size={13} className={loading ? "animate-spin" : ""} />
              {loading ? "불러오는 중" : channels.length ? "목록 새로고침" : "서버 불러오기"}
            </button>
            <button
              type="button"
              onClick={() => void collectNow()}
              disabled={collecting}
              className="rounded-md bg-primary px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {collecting ? "수집 중" : "지금 수집"}
            </button>
          </div>
        )}
      </div>

      {!botConfigured && (
        <div className="mt-3 rounded-md border border-warn-line bg-warn-soft px-3 py-2.5">
          <p className="text-[12px] font-medium text-warn">DISCORD_BOT_TOKEN이 서버에 없습니다.</p>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-[11.5px] leading-relaxed text-warn">
            <li>디스코드 개발자 포털에서 앱·봇을 만들고 토큰을 발급합니다.</li>
            <li>
              봇 설정에서 <b>Message Content Intent</b>를 켭니다. 이게 꺼져 있으면 본문이 빈 채로 옵니다.
            </li>
            <li>봇을 서버에 초대합니다 (채널 보기 · 메시지 기록 읽기 · 메시지 보내기 권한).</li>
            <li>Vercel 환경변수 DISCORD_BOT_TOKEN에 넣고 재배포합니다.</li>
          </ol>
        </div>
      )}

      {loaded?.error && (
        <p className="mt-3 rounded-md border border-critical-line bg-critical-soft px-3 py-2 text-[12px] text-critical">
          {loaded.error}
        </p>
      )}

      {result && (
        <p className="mt-3 rounded-md border border-line bg-sunk px-3 py-2 text-[12px] text-ink-2">{result}</p>
      )}

      {botConfigured && (
        <>
          {/* 서버 선택 — 대개 하나라 하나뿐이면 이름만 보여준다 */}
          {loaded && loaded.guilds.length > 0 && (
            <p className="mt-3 text-[12px] text-ink-3">
              서버{" "}
              {loaded.guilds.length === 1 ? (
                <b className="text-ink">{loaded.guilds[0].name}</b>
              ) : (
                <select
                  value={loaded.guildId ?? ""}
                  onChange={(e) => void load(e.target.value)}
                  className="ml-1 rounded-md border border-line bg-surface px-2 py-1 text-[12px]"
                >
                  {loaded.guilds.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              )}
            </p>
          )}

          {/* 모드 */}
          <div className="mt-3 grid gap-1.5 sm:grid-cols-3">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => onChange({ ...value, mode: m.key })}
                className={`rounded-md border px-3 py-2.5 text-left transition ${
                  value.mode === m.key
                    ? "border-primary bg-sunk"
                    : "border-line hover:border-line-strong"
                }`}
              >
                <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
                  {value.mode === m.key && <IconCheck size={12} />}
                  {m.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-ink-4">{m.desc}</span>
              </button>
            ))}
          </div>

          {/* 채널 목록 */}
          {channels.length > 0 ? (
            <div className="mt-3">
              <div className="flex items-baseline justify-between">
                <p className="text-[12px] font-medium text-ink-2">
                  {value.mode === "picked" ? "볼 채널을 고르세요" : "뺄 채널만 체크를 푸세요"}
                </p>
                <p className="text-[11.5px] text-ink-4">
                  대상 <span className="num font-medium text-ink-2">{대상수}</span> / {channels.length}
                </p>
              </div>
              <div className="thin-scroll mt-1.5 max-h-[240px] overflow-y-auto rounded-md border border-line p-2">
                {Array.from(grouped.entries()).map(([cat, list]) => (
                  <div key={cat} className="mb-2 last:mb-0">
                    <p className="px-1 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-4">
                      {cat}
                    </p>
                    <div className="grid gap-0.5 sm:grid-cols-2">
                      {list.map((c) => (
                        <label
                          key={c.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-sunk"
                        >
                          <input
                            type="checkbox"
                            checked={included(c)}
                            onChange={() => toggle(c)}
                            className="h-3.5 w-3.5 accent-good"
                          />
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                            {c.type === 15 ? "🗂" : "#"}
                            {c.name}
                          </span>
                          {value.digestChannel === c.id && (
                            <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent">
                              요약
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[10.5px] text-ink-4">
                🗂는 포럼 채널입니다. 본문이 없어 그 아래 스레드만 읽습니다. 봇이 못 보는 채널은 한 번
                시도한 뒤 일주일간 건너뜁니다.
              </p>
            </div>
          ) : (
            botConfigured &&
            !loading && (
              <p className="mt-3 text-[12px] text-ink-4">
                아직 채널 목록을 불러오지 않았습니다. 위 &quot;서버 불러오기&quot;를 눌러 주세요.
              </p>
            )
          )}

          {/* 📌 콕 집기 */}
          <div className="mt-4 rounded-md border border-line bg-sunk p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12.5px] font-medium text-ink">반응으로 콕 집기</p>
              <div className="flex items-center gap-1">
                {EMOJI_CHOICES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => onChange({ ...value, pinEmoji: e })}
                    className={`rounded-md border px-2 py-1 text-[14px] transition ${
                      value.pinEmoji === e ? "border-primary bg-surface" : "border-transparent hover:bg-surface"
                    }`}
                  >
                    {e}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => onChange({ ...value, pinEmoji: "" })}
                  className={`ml-1 rounded-md border px-2 py-1.5 text-[11.5px] transition ${
                    value.pinEmoji === "" ? "border-primary bg-surface text-ink" : "border-line text-ink-3"
                  }`}
                >
                  끔
                </button>
              </div>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
              {value.pinEmoji ? (
                <>
                  디스코드에서 메시지에 <b className="text-ink">{value.pinEmoji}</b> 반응을 붙이면 AI 판단과
                  무관하게 할일이 됩니다. 이미 지나간 메시지에도 붙일 수 있어서, 자동 수집이 놓친 것을
                  나중에 집어넣을 수 있습니다. 앞선 대화 4개를 맥락으로 함께 읽습니다.
                </>
              ) : (
                <>반응으로 집는 기능을 껐습니다. 자동 수집이 판단한 것만 들어옵니다.</>
              )}
            </p>
          </div>

          {/* 아침 요약 채널 */}
          {channels.length > 0 && (
            <label className="mt-3 block">
              <span className="text-[12px] font-medium text-ink-2">아침 요약을 보낼 채널</span>
              <select
                value={value.digestChannel}
                onChange={(e) => onChange({ ...value, digestChannel: e.target.value })}
                className="mt-1 w-full max-w-[320px] rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] focus:border-accent focus:outline-none"
              >
                <option value="">자동 (대상 채널 중 첫 번째)</option>
                {channels
                  .filter((c) => c.type !== 15)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </>
      )}
    </section>
  );
}
