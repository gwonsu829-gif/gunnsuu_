/**
 * 추출 한 건에 실제로 얼마가 드는지 화면에 보여주기 위한 계산.
 * 기획서에 "운영 비용: 건당 약 N원"을 추정이 아니라 실측으로 쓰기 위한 것.
 */

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * claude-sonnet-5 정가 (USD / 100만 토큰).
 * 2026-08-31까지는 입력 $2 / 출력 $10의 도입가가 적용되지만,
 * 곧 끝나므로 정가로 계산해 실제보다 적게 나오지 않게 한다.
 */
const USD_PER_MTOK_INPUT = 3;
const USD_PER_MTOK_OUTPUT = 15;

/** 환율은 자주 바뀌므로 대략치임을 화면에서도 "약"으로 표시한다. */
const KRW_PER_USD = 1400;

export function estimateUsd(usage: Usage): number {
  return (
    (usage.inputTokens / 1_000_000) * USD_PER_MTOK_INPUT +
    (usage.outputTokens / 1_000_000) * USD_PER_MTOK_OUTPUT
  );
}

export function estimateKrw(usage: Usage): number {
  return estimateUsd(usage) * KRW_PER_USD;
}

/** "약 13원" — 소수점 아래는 의미가 없으니 반올림한다. */
export function formatKrw(usage: Usage): string {
  const won = estimateKrw(usage);
  if (won < 1) return "1원 미만";
  return `약 ${Math.round(won).toLocaleString("ko-KR")}원`;
}

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

export const EMPTY_USAGE: Usage = { inputTokens: 0, outputTokens: 0 };
