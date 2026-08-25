import {
  fetchMessages,
  isUsable,
  readBotToken,
  readChannelConfig,
  toTranscript,
} from "./discord";
import { ingestText } from "./ingest";
import { getStore } from "./store";

/** 대화가 이만큼도 안 쌓였으면 다음 차례를 기다린다 (토막난 맥락으로 뽑지 않기 위해). */
const MIN_MESSAGES = 2;

export interface ChannelReport {
  채널: string;
  새_메시지: number;
  추가된_할일?: number;
  중복_의심?: number;
  건너뜀?: string;
  오류?: string;
}

export async function collectDiscord(): Promise<CollectOutcome> {
  const token = readBotToken();
  const channels = readChannelConfig();

  if (!token) {
    return { error: "DISCORD_BOT_TOKEN이 설정되지 않았습니다.", status: 503 };
  }
  if (!channels.length) {
    return { error: "DISCORD_CHANNELS가 설정되지 않았습니다.", status: 503 };
  }

  const store = getStore();
  const reports: ChannelReport[] = [];

  for (const channel of channels) {
    const cursorKey = `discord:${channel.id}`;
    try {
      const after = await store.getCursor(cursorKey);
      const messages = (await fetchMessages(token, channel.id, after)).filter(
        isUsable,
      );

      if (!messages.length) {
        reports.push({ 채널: channel.label, 새_메시지: 0 });
        continue;
      }

      // 어디까지 읽었는지는 추출 성공 여부와 무관하게 먼저 옮긴다.
      // 실패한 구간을 무한히 재시도하며 같은 할일을 쌓는 것보다 낫다.
      const newest = messages[messages.length - 1].id;

      if (messages.length < MIN_MESSAGES && !after) {
        reports.push({
          채널: channel.label,
          새_메시지: messages.length,
          건너뜀: "대화가 더 쌓이면 처리",
        });
        continue;
      }

      const result = await ingestText({
        text: toTranscript(channel.label, messages),
        channel: "discord",
        sourceLabel: channel.label,
        sourceRef: `${channel.id}:${newest}`,
      });

      await store.setCursor(cursorKey, newest);

      reports.push({
        채널: channel.label,
        새_메시지: messages.length,
        추가된_할일: result.added,
        중복_의심: result.duplicates,
        건너뜀: result.skipReason,
      });
    } catch (error) {
      reports.push({
        채널: channel.label,
        새_메시지: 0,
        오류: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { 저장소: store.kind, 채널별: reports };
}


export type CollectOutcome =
  | { error: string; status: number }
  | { 저장소: "redis" | "memory"; 채널별: ChannelReport[] };
