import { todayISO } from "./dates";
import { findDuplicateAmong } from "./dedupe";
import { runExtraction } from "./extract";
import { StoredTask, TaskSource, getStore } from "./store";
import { ExtractedTask } from "./types";
import { CallKind } from "./usage";

export interface IngestInput {
  text: string;
  channel: TaskSource;
  sourceLabel: string;
  /** 메시지 ID나 메일 ID. 같은 걸 두 번 처리하지 않기 위한 키. */
  sourceRef?: string;
  receivedAt?: string;
  /**
   * 사람이 이미 "이건 할일이다"라고 표시한 원문 (디스코드 📌).
   * 모델이 빈 배열을 돌려주지 않게 한다.
   */
  mustExtract?: boolean;
  /** 사용량을 어느 칸에 셀지 (lib/usage.ts). 기본은 수집. */
  kind?: CallKind;
}

export interface IngestResult {
  added: number;
  duplicates: number;
  skipped: boolean;
  skipReason?: string;
  demo: boolean;
  demoReason?: string;
  /** 추출이 실패해 원문을 그대로 남겨둔 경우. 부르는 쪽은 이 원문을 소비하면 안 된다. */
  retryLater?: boolean;
}

let counter = 0;
function newId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

/**
 * 원문 한 덩어리를 받아 할일을 뽑고 저장한다.
 * 메일 웹훅과 디스코드 수집이 공통으로 지나는 길.
 */
export async function ingestText(input: IngestInput): Promise<IngestResult> {
  const store = getStore();
  const text = input.text.trim();

  if (!text) {
    return { added: 0, duplicates: 0, skipped: true, skipReason: "본문이 비어 있음", demo: false };
  }

  // 재전송·중복 수신이 할일을 불려놓지 않게 먼저 막는다.
  if (input.sourceRef) {
    const fresh = await store.markIfUnseen(`${input.channel}:${input.sourceRef}`);
    if (!fresh) {
      return {
        added: 0,
        duplicates: 0,
        skipped: true,
        skipReason: "이미 처리한 메시지",
        demo: false,
      };
    }
  }

  const today = todayISO();
  const outcome = await runExtraction(text, today, undefined, {
    mustExtract: input.mustExtract,
    kind: input.kind ?? "collect",
  });

  /*
   * 자동 수집에서는 폴백 결과를 저장하지 않는다.
   *
   * 붙여넣기 화면은 빈 화면이 나오면 안 되므로 폴백이 맞다. 그러나 수집은
   * 다르다. 추측으로 만든 할일을 넣고 원문을 소비해 버리면, 진짜 할일은
   * 아무도 모르는 채로 사라진다. 누락을 막으려고 만든 경로가 누락을 만드는 셈이다.
   * 그래서 원문을 손대지 않고 남겨 다음 차례에 다시 읽히게 한다.
   */
  if (outcome.demo) {
    if (input.sourceRef) {
      await store.unmark(`${input.channel}:${input.sourceRef}`);
    }
    return {
      added: 0,
      duplicates: 0,
      skipped: true,
      skipReason: `AI 추출 실패 — 원문을 남겨두고 다음에 다시 시도합니다 (${outcome.demoReason ?? "원인 미상"})`,
      demo: true,
      demoReason: outcome.demoReason,
      retryLater: true,
    };
  }

  const { fresh, duplicates } = await storeExtracted(outcome.tasks, {
    channel: input.channel,
    sourceLabel: input.sourceLabel,
    rawText: text,
    receivedAt: input.receivedAt,
  });

  return {
    added: fresh.length,
    duplicates,
    skipped: false,
    demo: outcome.demo,
    demoReason: outcome.demoReason,
  };
}

/**
 * 뽑힌 할일을 중복 표시와 함께 저장한다.
 * 메일 동기화(lib/mail.ts)도 이 길을 지난다 — 중복 판정이 경로마다 달라지면 안 된다.
 */
export async function storeExtracted(
  tasks: ExtractedTask[],
  meta: {
    channel: TaskSource;
    sourceLabel: string;
    rawText: string;
    receivedAt?: string;
    mailId?: string;
  },
): Promise<{ fresh: StoredTask[]; duplicates: number }> {
  const store = getStore();
  const existing = await store.listTasks();
  const fresh: StoredTask[] = [];
  let duplicates = 0;

  for (const t of tasks) {
    // 같은 실행 안에서 나온 것끼리도 겹칠 수 있어 함께 비교한다.
    const dup = findDuplicateAmong(t.title, [...existing, ...fresh]);
    if (dup) duplicates += 1;
    fresh.push({
      ...t,
      id: newId(),
      channel: meta.channel,
      sourceLabel: meta.sourceLabel,
      rawText: meta.rawText,
      createdAt: meta.receivedAt ?? new Date().toISOString(),
      duplicateOf: dup?.id,
      mailId: meta.mailId,
      version: 0,
    });
  }

  await store.addTasks(fresh);
  return { fresh, duplicates };
}
