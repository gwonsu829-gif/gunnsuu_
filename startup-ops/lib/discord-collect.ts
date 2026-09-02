import {
  CollectSource,
  DiscordError,
  fetchGuildChannels,
  fetchMessages,
  fetchThreads,
  hasReaction,
  isNewerThan,
  isUsable,
  pickChannels,
  readBotToken,
  resolveGuildId,
  toTranscript,
} from "./discord";
import { ingestText } from "./ingest";
import { getStore } from "./store";
import { DiscordChannelInfo } from "./types";

/** 대화가 이만큼도 안 쌓였으면 다음 차례를 기다린다 (토막난 맥락으로 뽑지 않기 위해). */
const MIN_MESSAGES = 2;
/** 화면이 열려 있을 때 자동으로 도는 최소 간격. */
export const AUTO_SYNC_INTERVAL_MS = 5 * 60_000;
/** 📌를 찾을 때 훑는 최근 메시지 수. 반응은 지나간 메시지에도 붙으므로 커서로는 못 잡는다. */
const PIN_SCAN_LIMIT = 50;
/** 📌 앞에 이만큼을 맥락으로 붙인다. "그거 해주세요"만 있으면 무슨 일인지 모른다. */
const PIN_CONTEXT = 4;
/** 못 읽는 채널을 이 기간 동안 건너뛴다. 매 실행마다 403을 다시 받을 이유가 없다. */
const BLOCKED_DAYS = 7;

const LAST_SYNC_KEY = "discord:lastSync";
const BLOCKED_KEY = "discord:blocked";

export interface ChannelReport {
  채널: string;
  스레드?: boolean;
  새_메시지: number;
  추가된_할일?: number;
  콕집은_할일?: number;
  중복_의심?: number;
  건너뜀?: string;
  오류?: string;
}

export type CollectOutcome =
  | { error: string; status: number }
  | {
      저장소: "redis" | "memory";
      서버?: string;
      대상채널: number;
      모드: "all" | "picked" | "off";
      콕집기: string | null;
      채널별: ChannelReport[];
      건너뜀?: string;
    };

type Blocked = Record<string, string>;

/**
 * 디스코드 → 할일.
 *
 * 두 갈래로 들어온다.
 *
 *  자동 수집 — 채널·스레드의 새 대화를 덩어리로 읽어 AI가 할일을 판단한다.
 *              놓치는 게 없는 대신 오탐이 있고, 지나간 대화는 커서 뒤로 사라진다.
 *
 *  📌 콕 집기 — 사람이 메시지에 반응을 붙이면 AI 판단과 무관하게 할일이 된다.
 *              오탐이 0이고, 이미 지나간 메시지에도 붙일 수 있다.
 *              대시보드를 열지 않고 디스코드 안에서 할일을 등록하는 유일한 길이다.
 *
 * 둘 다 켜두는 게 기본이다. 같은 건이 양쪽으로 들어오면 dedupe가 중복으로 표시만 한다
 * (합치지 않는 이유는 CLAUDE.md의 설계 결정 2번).
 */
export async function collectDiscord(
  opts: { force?: boolean } = {},
): Promise<CollectOutcome> {
  const token = readBotToken();
  if (!token) {
    return { error: "DISCORD_BOT_TOKEN이 설정되지 않았습니다.", status: 503 };
  }

  const store = getStore();

  if (!opts.force) {
    const last = await store.getJSON<{ at: string }>(LAST_SYNC_KEY);
    if (last && Date.now() - Date.parse(last.at) < AUTO_SYNC_INTERVAL_MS) {
      return {
        저장소: store.kind,
        대상채널: 0,
        모드: (await store.getSettings()).discord.mode,
        콕집기: null,
        채널별: [],
        건너뜀: "최근에 수집했습니다.",
      };
    }
  }
  // 두 브라우저가 동시에 부르면 같은 대화를 두 번 읽는다. 먼저 찍은 쪽만 돈다.
  await store.setJSON(LAST_SYNC_KEY, { at: new Date().toISOString() });

  const settings = await store.getSettings();
  const pin = settings.discord.pinEmoji;
  const reports: ChannelReport[] = [];

  let guildId: string;
  let channels: DiscordChannelInfo[];
  try {
    guildId = await resolveGuildId(token, settings.discord);
    channels = await fetchGuildChannels(token, guildId);
  } catch (error) {
    return {
      error:
        error instanceof DiscordError
          ? error.message
          : "서버·채널 목록을 읽지 못했습니다. 봇 토큰과 권한을 확인하세요.",
      status: 502,
    };
  }

  const blocked = (await store.getJSON<Blocked>(BLOCKED_KEY)) ?? {};
  const blockedCutoff = Date.now() - BLOCKED_DAYS * 86_400_000;
  const stillBlocked = (id: string) => {
    const at = blocked[id];
    return Boolean(at && Date.parse(at) > blockedCutoff);
  };

  const targets = pickChannels(channels, settings.discord).filter((c) => !stillBlocked(c.id));
  if (!targets.length) {
    return {
      저장소: store.kind,
      대상채널: 0,
      모드: settings.discord.mode,
      콕집기: pin || null,
      채널별: [],
      건너뜀:
        settings.discord.mode === "picked"
          ? "설정에서 고른 채널이 없습니다."
          : "봇이 읽을 수 있는 채널이 없습니다. 봇을 채널에 초대했는지 확인하세요.",
    };
  }

  /*
   * 채널 본문과 그 아래 스레드를 같은 방식으로 훑는다.
   * 프로젝트 단위 채널에서는 실제 업무 대화가 스레드에서 오가므로,
   * 채널만 보면 그 대화가 통째로 누락된다.
   */
  const sources: CollectSource[] = targets.map((c) => ({ id: c.id, label: `#${c.name}` }));
  try {
    sources.push(...(await fetchThreads(token, guildId, targets)));
  } catch (error) {
    reports.push({
      채널: "(스레드 조회)",
      새_메시지: 0,
      오류: error instanceof Error ? error.message : String(error),
    });
  }

  let blockedChanged = false;

  for (const source of sources) {
    const cursorKey = `discord:${source.id}`;
    const report: ChannelReport = {
      채널: source.label,
      스레드: Boolean(source.parentId),
      새_메시지: 0,
    };

    try {
      const after = await store.getCursor(cursorKey);

      /*
       * 반응은 지나간 메시지에도 붙는다. after 커서로 읽으면 새 메시지만 오므로
       * 📌를 찾으려면 최근 구간을 따로 봐야 한다. 커서가 없는 첫 실행에서는
       * 두 요청이 같은 결과라 한 번만 부른다.
       */
      const scan = pin ? await fetchMessages(token, source.id, null, PIN_SCAN_LIMIT) : [];
      const fresh =
        !pin || after
          ? (await fetchMessages(token, source.id, after)).filter(isUsable)
          : scan.filter(isUsable).filter((m) => isNewerThan(m.id, after));

      /* ---------- 1. 📌 콕 집은 메시지 ---------- */
      if (pin) {
        let pinned = 0;
        for (let i = 0; i < scan.length; i += 1) {
          const m = scan[i];
          if (!isUsable(m) || !hasReaction(m, pin)) continue;

          // 앞선 대화를 맥락으로 붙인다. "그거 처리 부탁"만으로는 할일이 안 된다.
          const context = scan
            .slice(Math.max(0, i - PIN_CONTEXT), i + 1)
            .filter(isUsable);

          const result = await ingestText({
            text: toTranscript(`${source.label} · ${pin} 표시`, context),
            channel: "discord",
            sourceLabel: `${source.label} ${pin}`,
            sourceRef: `pin:${m.id}`,
            receivedAt: m.timestamp,
            mustExtract: true,
          });
          if (!result.skipped) pinned += result.added;
        }
        if (pinned) report.콕집은_할일 = pinned;
      }

      /* ---------- 2. 자동 수집 ---------- */
      if (settings.discord.mode === "off") {
        report.건너뜀 = "자동 수집 꺼둠 (📌만 받습니다)";
        reports.push(report);
        continue;
      }

      report.새_메시지 = fresh.length;
      if (!fresh.length) {
        reports.push(report);
        continue;
      }

      // 어디까지 읽었는지는 추출 성공 여부와 무관하게 먼저 정해 둔다.
      const newest = fresh[fresh.length - 1].id;

      if (fresh.length < MIN_MESSAGES && !after) {
        report.건너뜀 = "대화가 더 쌓이면 처리";
        reports.push(report);
        continue;
      }

      const result = await ingestText({
        text: toTranscript(source.label, fresh),
        channel: "discord",
        sourceLabel: source.label,
        sourceRef: `${source.id}:${newest}`,
      });

      // 추출이 실패한 구간은 커서를 옮기지 않는다.
      // 옮기면 그 대화는 다시 읽히지 않고, 거기 있던 할일은 영영 사라진다.
      if (!result.retryLater) {
        await store.setCursor(cursorKey, newest);
      }

      report.추가된_할일 = result.added;
      report.중복_의심 = result.duplicates;
      report.건너뜀 = result.skipReason;
      reports.push(report);
    } catch (error) {
      /*
       * 못 읽는 채널(봇이 초대 안 된 비공개 채널 등)은 기억해 두고 한동안 건너뛴다.
       * "모든 채널" 모드에서는 서버의 모든 채널이 목록에 오므로,
       * 기억하지 않으면 매 실행마다 같은 403을 채널 수만큼 받는다.
       */
      if (error instanceof DiscordError && (error.status === 403 || error.status === 404)) {
        blocked[source.id] = new Date().toISOString();
        blockedChanged = true;
        report.건너뜀 = "읽을 권한이 없어 당분간 건너뜁니다";
      } else {
        report.오류 = error instanceof Error ? error.message : String(error);
      }
      reports.push(report);
    }
  }

  if (blockedChanged) await store.setJSON(BLOCKED_KEY, blocked);

  return {
    저장소: store.kind,
    서버: guildId,
    대상채널: targets.length,
    모드: settings.discord.mode,
    콕집기: pin || null,
    채널별: reports,
  };
}

/** 설정에서 채널을 다시 고르면 "못 읽는 채널" 기억을 지운다. 권한을 고쳤을 수도 있다. */
export async function clearBlocked(): Promise<void> {
  await getStore().del(BLOCKED_KEY);
}

export async function lastSyncAt(): Promise<string | null> {
  return (await getStore().getJSON<{ at: string }>(LAST_SYNC_KEY))?.at ?? null;
}
