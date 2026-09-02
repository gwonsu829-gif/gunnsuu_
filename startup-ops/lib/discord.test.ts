import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * 신뢰 경계와 조용히 틀리는 비교만 확인한다.
 * 특히 스노플레이크 비교 — 문자열로 비교하면 자릿수가 바뀌는 순간(999... → 1000...)
 * 새 메시지를 통째로 놓치는데, 화면에는 "새 메시지 없음"으로 보여 알아채기 어렵다.
 */
import { hasReaction, isNewerThan, pickChannels } from "./discord";
import { normalizeSettings, DEFAULT_SETTINGS } from "./settings";
import { buildUserPrompt } from "./prompt";

const msg = (reactions?: { name: string | null; id?: string | null }[]) => ({
  id: "1", content: "x", timestamp: new Date().toISOString(),
  author: { username: "a" },
  reactions: reactions?.map((e) => ({ count: 1, emoji: { id: e.id ?? null, name: e.name } })),
});

test("반응: 유니코드·커스텀 이모지 모두 인식, 없으면 false", () => {
  assert.equal(hasReaction(msg([{ name: "📌" }]) as never, "📌"), true);
  assert.equal(hasReaction(msg([{ name: "👀" }]) as never, "📌"), false);
  assert.equal(hasReaction(msg() as never, "📌"), false);
  // 커스텀 이모지는 이름만 온다. 설정에 :할일: 처럼 적어도 맞아야 한다.
  assert.equal(hasReaction(msg([{ name: "할일", id: "999" }]) as never, ":할일:"), true);
  // 기능을 껐으면(빈 문자열) 어떤 메시지도 걸리면 안 된다.
  assert.equal(hasReaction(msg([{ name: "📌" }]) as never, ""), false);
});

test("스노플레이크 비교: 문자열이 아니라 수로", () => {
  // 문자열 비교였다면 "9..." > "10..." 이 되어 새 메시지를 놓친다.
  assert.equal(isNewerThan("1000000000000000000", "999999999999999999"), true);
  assert.equal(isNewerThan("999999999999999999", "1000000000000000000"), false);
  assert.equal(isNewerThan("1", null), true);
});

test("채널 고르기: all은 제외만, picked는 고른 것만, off도 목록은 준다", () => {
  const all = [
    { id: "1", name: "일반", category: "", type: 0 },
    { id: "2", name: "잡담", category: "", type: 0 },
    { id: "3", name: "포럼", category: "", type: 15 },
  ];
  const base = DEFAULT_SETTINGS.discord;
  assert.deepEqual(pickChannels(all, { ...base, mode: "all", excluded: ["2"] }).map((c) => c.id), ["1", "3"]);
  assert.deepEqual(pickChannels(all, { ...base, mode: "picked", channels: ["2"] }).map((c) => c.id), ["2"]);
  // off여도 📌는 읽어야 하므로 목록은 그대로다.
  assert.equal(pickChannels(all, { ...base, mode: "off" }).length, 3);
});

test("설정 정규화: 이상한 디스코드 값은 기본값으로", () => {
  const s = normalizeSettings({
    discord: { mode: "이상함", channels: ["123456789", "abc", "123456789"], excluded: "x", pinEmoji: "아주긴문자열입니다정말로", digestChannel: "nope", guildId: "12345678901" },
  });
  assert.equal(s.discord.mode, "all");
  assert.deepEqual(s.discord.channels, ["123456789"]);
  assert.deepEqual(s.discord.excluded, []);
  assert.ok(Array.from(s.discord.pinEmoji).length <= 4);
  assert.equal(s.discord.digestChannel, "");
  assert.equal(s.discord.guildId, "12345678901");
  // 설정이 통째로 없어도 기본값이 나와야 한다.
  assert.equal(normalizeSettings(null).discord.pinEmoji, "📌");
});

test("mustExtract 프롬프트는 빈 배열을 막는 문장을 넣는다", () => {
  assert.ok(!buildUserPrompt("대화").includes("반드시"));
  assert.ok(buildUserPrompt("대화", true).includes("반드시 한 건 이상"));
});
