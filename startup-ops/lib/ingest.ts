import { todayISO } from "./dates";
import { findDuplicateAmong } from "./dedupe";
import { runExtraction } from "./extract";
import { StoredTask, TaskSource, getStore } from "./store";

export interface IngestInput {
  text: string;
  channel: TaskSource;
  sourceLabel: string;
  /** 메시지 ID나 메일 ID. 같은 걸 두 번 처리하지 않기 위한 키. */
  sourceRef?: string;
  receivedAt?: string;
}

export interface IngestResult {
  added: number;
  duplicates: number;
  skipped: boolean;
  skipReason?: string;
  demo: boolean;
  demoReason?: string;
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
  const outcome = await runExtraction(text, today);

  const existing = await store.listTasks();
  const fresh: StoredTask[] = [];
  let duplicates = 0;

  for (const t of outcome.tasks) {
    // 같은 실행 안에서 나온 것끼리도 겹칠 수 있어 함께 비교한다.
    const dup = findDuplicateAmong(t.title, [...existing, ...fresh]);
    if (dup) duplicates += 1;
    fresh.push({
      ...t,
      id: newId(),
      channel: input.channel,
      sourceLabel: input.sourceLabel,
      rawText: text,
      createdAt: input.receivedAt ?? new Date().toISOString(),
      duplicateOf: dup?.id,
    });
  }

  await store.addTasks(fresh);

  return {
    added: fresh.length,
    duplicates,
    skipped: false,
    demo: outcome.demo,
    demoReason: outcome.demoReason,
  };
}
