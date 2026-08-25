import { Task } from "./types";

/**
 * 한국어는 조사·어미가 흔들려서 단어 단위 비교가 잘 깨진다.
 * ("재현하기" vs "재현하고") 글자 2-gram 집합으로 비교한다.
 */
function bigrams(s: string): Set<string> {
  const cleaned = s.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
  const out = new Set<string>();
  for (let i = 0; i < cleaned.length - 1; i += 1) {
    out.add(cleaned.slice(i, i + 2));
  }
  return out;
}

function overlap(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  a.forEach((g) => {
    if (b.has(g)) shared += 1;
  });
  return shared;
}

/** 짧은 쪽이 긴 쪽에 얼마나 담겨 있는지 (0~1) */
export function similarity(a: string, b: string): number {
  const ga = bigrams(a);
  const gb = bigrams(b);
  const min = Math.min(ga.size, gb.size);
  if (min < 4) return 0;
  return overlap(ga, gb) / min;
}

const DUPLICATE_THRESHOLD = 0.5;

/**
 * 이미 등록된 할일 중 같은 건으로 보이는 것을 찾는다.
 * 여러 채널로 같은 일이 중복 인입되는 게 이 문제의 핵심이라
 * 자동 병합하지 않고 표시만 해서 사람이 판단하게 둔다.
 */
export function findDuplicateAmong<T extends { id: string; title: string }>(
  candidateTitle: string,
  existing: T[],
): T | undefined {
  let best: T | undefined;
  let bestScore = DUPLICATE_THRESHOLD;
  for (const task of existing) {
    const score = similarity(candidateTitle, task.title);
    if (score >= bestScore) {
      best = task;
      bestScore = score;
    }
  }
  return best;
}

export function findDuplicate(
  candidateTitle: string,
  existing: Task[],
): Task | undefined {
  return findDuplicateAmong(candidateTitle, existing);
}
