const API = "https://discord.com/api/v10";

export interface DiscordMessage {
  id: string;
  content: string;
  timestamp: string;
  author: { username: string; global_name?: string | null; bot?: boolean };
}

/** 채널이든 그 아래 스레드든, 수집 대상은 같은 모양으로 다룬다. */
export interface CollectSource {
  id: string;
  label: string;
  /** 스레드면 부모 채널 id */
  parentId?: string;
}

export interface ChannelConfig {
  id: string;
  /** 화면에 보여줄 이름. 설정에 없으면 채널 ID를 그대로 쓴다. */
  label: string;
}

/** DISCORD_CHANNELS="123456:#dev-일반, 789012:#cs-문의" */
export function readChannelConfig(): ChannelConfig[] {
  const raw = (process.env.DISCORD_CHANNELS ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const sep = chunk.indexOf(":");
      if (sep === -1) return { id: chunk, label: `채널 ${chunk}` };
      return {
        id: chunk.slice(0, sep).trim(),
        label: chunk.slice(sep + 1).trim() || `채널 ${chunk.slice(0, sep).trim()}`,
      };
    })
    .filter((c) => c.id);
}

export function readBotToken(): string {
  return (process.env.DISCORD_BOT_TOKEN ?? "").trim().replace(/^["']|["']$/g, "");
}

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

  const res = await fetch(`${API}/channels/${channelId}/messages?${params}`, {
    headers: { Authorization: `Bot ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `디스코드 API ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
    );
  }

  const messages = (await res.json()) as DiscordMessage[];
  // 디스코드는 최신순으로 준다. 대화 순서대로 읽어야 맥락이 산다.
  return messages.slice().reverse();
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

async function discordGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bot ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `디스코드 API ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
    );
  }
  return (await res.json()) as T;
}

/**
 * 서버 id를 설정으로 받지 않고 채널 하나를 조회해 알아낸다.
 * 사용자가 채널 id만 넣으면 되도록 하려는 것.
 */
export async function fetchGuildId(
  token: string,
  channelId: string,
): Promise<string> {
  const ch = await discordGet<{ guild_id?: string }>(token, `/channels/${channelId}`);
  if (!ch.guild_id) throw new Error("채널에서 서버 id를 찾지 못했습니다.");
  return ch.guild_id;
}

/** 보관된 지 이만큼 지난 스레드는 지나간 대화로 보고 건드리지 않는다. */
const ARCHIVED_WINDOW_DAYS = 7;

/**
 * 설정한 채널들에 달린 스레드를 찾는다.
 *
 * 앰플랩 서버는 채널이 프로젝트 단위라 실제 업무 대화가 그 아래 스레드에서
 * 오간다. 채널 본문만 긁으면 그 대화가 통째로 누락된다.
 *
 * 활성 스레드 전부 + 최근 보관된 스레드까지 본다. 오래 전에 보관된 것까지
 * 훑으면 첫 실행에서 지나간 대화가 한꺼번에 할일로 올라온다.
 */
export async function fetchThreads(
  token: string,
  channels: ChannelConfig[],
): Promise<CollectSource[]> {
  if (!channels.length) return [];

  const wanted = new Map(channels.map((c) => [c.id, c.label]));
  const found = new Map<string, CollectSource>();

  const add = (t: ThreadChannel) => {
    const parent = t.parent_id ? wanted.get(t.parent_id) : undefined;
    if (!parent || found.has(t.id)) return;
    found.set(t.id, {
      id: t.id,
      label: `${parent} › ${t.name}`,
      parentId: t.parent_id ?? undefined,
    });
  };

  // 활성 스레드는 서버 단위로 한 번에 받아온다.
  const guildId = await fetchGuildId(token, channels[0].id);
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

/** 아침 요약을 보낼 채널. 없으면 수집 채널 중 첫 번째를 쓴다. */
export function readDigestChannelId(): string | null {
  const explicit = (process.env.DISCORD_DIGEST_CHANNEL ?? "").trim();
  if (explicit) return explicit;
  return readChannelConfig()[0]?.id ?? null;
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
    throw new Error(
      `디스코드 전송 ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
    );
  }
}
