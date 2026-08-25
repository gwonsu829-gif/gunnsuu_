const API = "https://discord.com/api/v10";

export interface DiscordMessage {
  id: string;
  content: string;
  timestamp: string;
  author: { username: string; global_name?: string | null; bot?: boolean };
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
