import { DiscordChannelInfo, DiscordGuildInfo, DiscordSettings, Settings } from "./types";

const API = "https://discord.com/api/v10";

export interface DiscordReaction {
  count: number;
  emoji: { id: string | null; name: string | null };
}

export interface DiscordMessage {
  id: string;
  content: string;
  timestamp: string;
  author: { username: string; global_name?: string | null; bot?: boolean };
  /** 반응이 하나도 없으면 이 필드 자체가 오지 않는다. */
  reactions?: DiscordReaction[];
}

/** 채널이든 그 아래 스레드든, 수집 대상은 같은 모양으로 다룬다. */
export interface CollectSource {
  id: string;
  label: string;
  /** 스레드면 부모 채널 id */
  parentId?: string;
}

export function readBotToken(): string {
  return (process.env.DISCORD_BOT_TOKEN ?? "").trim().replace(/^["']|["']$/g, "");
}

export class DiscordError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function discordGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bot ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new DiscordError(
      `디스코드 API ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

/* ---------------- 서버·채널 찾기 ---------------- */

/**
 * 봇이 들어가 있는 서버 목록.
 *
 * 예전에는 채널 ID를 환경변수에 적게 했는데, 봇이 이미 서버에 있으면
 * 이 정보는 봇이 스스로 알 수 있다. 사람이 개발자 모드를 켜고 ID를 복사해
 * 붙여넣고 재배포하는 과정이 통째로 필요 없다.
 */
export async function fetchGuilds(token: string): Promise<DiscordGuildInfo[]> {
  const guilds = await discordGet<{ id: string; name: string }[]>(token, "/users/@me/guilds");
  return guilds.map((g) => ({ id: g.id, name: g.name }));
}

/** 대화를 직접 읽을 수 있는 채널 종류. 4는 카테고리(폴더)라 이름만 쓴다. */
const TEXT_TYPES = [0, 5];
const FORUM_TYPE = 15;
const CATEGORY_TYPE = 4;

interface RawChannel {
  id: string;
  name: string;
  type: number;
  parent_id?: string | null;
  position?: number;
}

/**
 * 서버의 텍스트·공지·포럼 채널. 카테고리 이름을 붙여 화면에서 접어 보여줄 수 있게 한다.
 *
 * 주의: 이 목록에는 봇이 볼 수 없는 채널도 섞여 나온다. 권한은 여기서 판단하지 않고
 * 실제로 읽어보고 403이 나면 그때 걸러낸다 (lib/discord-collect.ts의 blocked).
 * 권한 계산을 흉내 내면 역할·오버라이드 조합에서 반드시 틀린다.
 */
export async function fetchGuildChannels(
  token: string,
  guildId: string,
): Promise<DiscordChannelInfo[]> {
  const raw = await discordGet<RawChannel[]>(token, `/guilds/${guildId}/channels`);
  const categories = new Map<string, string>();
  for (const c of raw) {
    if (c.type === CATEGORY_TYPE) categories.set(c.id, c.name);
  }
  return raw
    .filter((c) => TEXT_TYPES.includes(c.type) || c.type === FORUM_TYPE)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((c) => ({
      id: c.id,
      name: c.name,
      category: (c.parent_id && categories.get(c.parent_id)) || "",
      type: c.type,
    }));
}

/** 설정에 서버가 없으면 봇이 들어간 첫 서버를 쓴다. 3인 팀은 서버가 하나다. */
export async function resolveGuildId(token: string, settings: DiscordSettings): Promise<string> {
  if (settings.guildId) return settings.guildId;
  const guilds = await fetchGuilds(token);
  if (!guilds.length) {
    throw new DiscordError("봇이 들어가 있는 서버가 없습니다. 봇을 서버에 초대하세요.");
  }
  return guilds[0].id;
}

/**
 * 설정을 실제 수집 대상 채널로 바꾼다.
 * mode가 off여도 채널 목록은 돌려준다 — 📌로 콕 집은 것은 그래도 읽어야 하기 때문.
 */
export function pickChannels(
  all: DiscordChannelInfo[],
  settings: DiscordSettings,
): DiscordChannelInfo[] {
  const readable = all.filter((c) => TEXT_TYPES.includes(c.type) || c.type === FORUM_TYPE);
  if (settings.mode === "picked") {
    return readable.filter((c) => settings.channels.includes(c.id));
  }
  // all / off 둘 다 "제외 목록을 뺀 전부"가 대상이다. off는 자동 추출만 건너뛴다.
  return readable.filter((c) => !settings.excluded.includes(c.id));
}

/* ---------------- 메시지 ---------------- */

/**
 * after 이후에 올라온 메시지를 오래된 순으로 돌려준다.
 * after가 없으면 최근 몇 건만 가져와 첫 실행에서 채널 전체를 훑지 않게 한다.
 */
export async function fetchMessages(
  token: string,
  channelId: string,
  after: string | null,
  limit = 50,
): Promise<DiscordMessage[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (after) params.set("after", after);
  const messages = await discordGet<DiscordMessage[]>(
    token,
    `/channels/${channelId}/messages?${params}`,
  );
  // 디스코드는 최신순으로 준다. 대화 순서대로 읽어야 맥락이 산다.
  return messages.slice().reverse();
}

/**
 * 이 메시지에 그 이모지가 붙어 있는지.
 *
 * 유니코드 이모지는 emoji.name에 글자가 그대로 온다(📌). 서버 전용 커스텀
 * 이모지는 id가 있고 name이 ':' 없는 이름이라, 설정에 이름만 적어도 맞는다.
 */
export function hasReaction(m: DiscordMessage, emoji: string): boolean {
  if (!emoji) return false;
  const want = emoji.replace(/^:|:$/g, "");
  return (m.reactions ?? []).some((r) => {
    const name = r.emoji.name ?? "";
    return name === emoji || name === want;
  });
}

/**
 * 흩어진 메시지를 대화 한 덩어리로 합친다.
 * 할일은 여러 발화에 걸쳐 있는 경우가 많아 한 건씩 넣으면 맥락이 끊긴다.
 */
export function toTranscript(label: string, messages: DiscordMessage[]): string {
  const lines = [`[${label}]`, ""];
  for (const m of messages) {
    const name = m.author.global_name || m.author.username;
    lines.push(`${name} — ${formatKstTime(m.timestamp)}`, m.content, "");
  }
  return lines.join("\n").trim();
}

/** 봇이 자기 말이나 다른 봇 알림을 할일로 만들지 않게 한다. */
export function isUsable(m: DiscordMessage): boolean {
  return !m.author.bot && m.content.trim().length > 0;
}

/** 스노플레이크는 시간순으로 커지는 숫자라 문자열 대신 BigInt로 비교한다. */
export function isNewerThan(id: string, cursor: string | null): boolean {
  if (!cursor) return true;
  try {
    return BigInt(id) > BigInt(cursor);
  } catch {
    return true;
  }
}

/** "8/25 오전 10:12" — 사람이 쓴 디스코드 로그와 같은 모양으로 맞춘다. */
function formatKstTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour24 = Number(get("hour"));
  const meridiem = hour24 < 12 ? "오전" : "오후";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return `${Number(get("month"))}/${Number(get("day"))} ${meridiem} ${hour12}:${get("minute")}`;
}

/* ---------- 스레드 ---------- */

interface ThreadChannel {
  id: string;
  name: string;
  parent_id?: string | null;
  thread_metadata?: { archived?: boolean; archive_timestamp?: string };
}

/** 보관된 지 이만큼 지난 스레드는 지나간 대화로 보고 건드리지 않는다. */
const ARCHIVED_WINDOW_DAYS = 7;

/**
 * 대상 채널들에 달린 스레드를 찾는다.
 *
 * 앰플랩 서버는 채널이 프로젝트 단위라 실제 업무 대화가 그 아래 스레드에서
 * 오간다. 채널 본문만 긁으면 그 대화가 통째로 누락된다.
 *
 * 활성 스레드 전부 + 최근 보관된 스레드까지 본다. 오래 전에 보관된 것까지
 * 훑으면 첫 실행에서 지나간 대화가 한꺼번에 할일로 올라온다.
 */
export async function fetchThreads(
  token: string,
  guildId: string,
  channels: DiscordChannelInfo[],
): Promise<CollectSource[]> {
  if (!channels.length) return [];

  const wanted = new Map(channels.map((c) => [c.id, c.name]));
  const found = new Map<string, CollectSource>();

  const add = (t: ThreadChannel) => {
    const parent = t.parent_id ? wanted.get(t.parent_id) : undefined;
    if (!parent || found.has(t.id)) return;
    found.set(t.id, {
      id: t.id,
      label: `#${parent} › ${t.name}`,
      parentId: t.parent_id ?? undefined,
    });
  };

  // 활성 스레드는 서버 단위로 한 번에 받아온다.
  const active = await discordGet<{ threads: ThreadChannel[] }>(
    token,
    `/guilds/${guildId}/threads/active`,
  );
  active.threads.forEach(add);

  // 최근 보관된 스레드는 채널별로 확인한다.
  const cutoff = Date.now() - ARCHIVED_WINDOW_DAYS * 86_400_000;
  for (const channel of channels) {
    try {
      const archived = await discordGet<{ threads: ThreadChannel[] }>(
        token,
        `/channels/${channel.id}/threads/archived/public?limit=10`,
      );
      for (const t of archived.threads) {
        const ts = t.thread_metadata?.archive_timestamp;
        if (ts && Date.parse(ts) < cutoff) continue;
        add(t);
      }
    } catch {
      // 스레드를 못 읽어도 채널 본문 수집은 계속되어야 한다.
    }
  }

  return Array.from(found.values());
}

/* ---------- 보내기 ---------- */

/**
 * 아침 요약을 보낼 채널.
 *
 * 설정에 지정한 채널이 있으면 그것을, 없으면 수집 대상 중 첫 번째 텍스트 채널을 쓴다.
 * 예전에는 DISCORD_DIGEST_CHANNEL 환경변수였는데, 채널을 바꾸려고 재배포하게 만들 이유가 없다.
 */
export async function resolveDigestChannel(
  token: string,
  settings: Settings,
): Promise<string | null> {
  if (settings.discord.digestChannel) return settings.discord.digestChannel;
  try {
    const guildId = await resolveGuildId(token, settings.discord);
    const channels = pickChannels(await fetchGuildChannels(token, guildId), settings.discord);
    return channels.find((c) => TEXT_TYPES.includes(c.type))?.id ?? null;
  } catch {
    return null;
  }
}

export async function sendMessage(
  token: string,
  channelId: string,
  content: string,
): Promise<void> {
  const res = await fetch(`${API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new DiscordError(
      `디스코드 전송 ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
      res.status,
    );
  }
}
