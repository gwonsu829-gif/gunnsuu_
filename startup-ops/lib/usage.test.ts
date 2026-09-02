import { test } from "node:test";
import assert from "node:assert/strict";

import { checkQuota, readUsage, recordCall } from "./usage";
import { normalizeSettings, DEFAULT_SETTINGS } from "./settings";

/**
 * 상한이 하는 일은 하나다 — "이 숫자를 절대 못 넘는다"를 보장하는 것.
 * 그 보장이 깨지면 요금 걱정 때문에 기능을 꺼 두게 되므로 확인을 남긴다.
 */
test("상한: 다 쓰면 exhausted, 0이면 무제한", async () => {
  assert.equal((await readUsage()).calls, 0);

  for (let i = 0; i < 3; i += 1) await recordCall("collect");
  await recordCall("pin");

  const u = await readUsage();
  assert.equal(u.calls, 4);
  assert.equal(u.collect, 3);
  assert.equal(u.pin, 1);
  assert.equal(u.manual, 0);

  const 여유 = await checkQuota(10);
  assert.deepEqual([여유.used, 여유.left, 여유.exhausted], [4, 6, false]);

  const 도달 = await checkQuota(4);
  assert.equal(도달.exhausted, true);
  assert.equal(도달.left, 0);

  // 상한을 이미 넘긴 상태여도 음수가 나오면 안 된다 (화면이 -3회로 보이면 안 됨).
  assert.equal((await checkQuota(2)).left, 0);

  // 0은 "상한 없음"이지 "한 번도 못 씀"이 아니다. 이 둘을 헷갈리면 수집이 통째로 멈춘다.
  assert.equal((await checkQuota(0)).exhausted, false);
});

test("설정: 상한·간격은 범위를 벗어나면 잘라낸다", () => {
  assert.equal(normalizeSettings({ aiDailyLimit: -5 }).aiDailyLimit, 0);
  assert.equal(normalizeSettings({ aiDailyLimit: 99999 }).aiDailyLimit, 5000);
  assert.equal(normalizeSettings({ aiDailyLimit: "이상함" }).aiDailyLimit, DEFAULT_SETTINGS.aiDailyLimit);
  // 0분이면 화면을 열어 둔 것만으로 호출이 폭주한다. 최소 1분.
  assert.equal(normalizeSettings({ syncMinutes: 0 }).syncMinutes, 1);
  assert.equal(normalizeSettings({ syncMinutes: 12.4 }).syncMinutes, 12);
});
