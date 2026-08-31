import { ExtractedTask, Role, Slot, StageAt, Status } from "./types";

export type TaskSource = "manual" | "email" | "discord";

export interface StoredTask extends ExtractedTask {
  id: string;
  /**
   * 어느 채널로 들어왔는지.
   * ExtractedTask.source는 "판단 근거가 된 원문 문장"이라 이름을 겹치면 안 된다.
   */
  channel: TaskSource;
  /** 화면에 보여줄 출처 이름. 예: "다온컴퍼니 오류 문의" / "#dev-일반" */
  sourceLabel: string;
  /** 판단 근거를 되짚을 원문 전체 */
  rawText: string;
  /** ISO 문자열 */
  createdAt: string;
  /** 같은 건으로 보이는 기존 할일 id */
  duplicateOf?: string;
  /** 각 단계를 언제 통과했는지 */
  stageAt?: StageAt;
  /** 손대기로 잡아둔 시간. 없으면 아직 안 잡은 일. */
  slot?: Slot;
  /**
   * 사람이 덮어쓴 항목.
   *
   * AI가 정한 값을 사람이 얼마나 고치는지가 추출 품질의 유일한 실사용 신호다.
   * 고친 뒤 값만 남기면 "원래 그렇게 나왔는지" 알 수 없어 이 표시를 따로 둔다.
   * 되돌려도 지우지 않는다 — 손이 갔다는 사실 자체가 신호다.
   */
  edited?: { role?: true; priority?: true; assignee?: true };
}

export interface TaskPatch {
  role?: Role;
  status?: Status;
  priority?: ExtractedTask["priority"];
  assignee?: string;
  /** 서버가 직접 찍는다. 화면에서 온 값은 쓰지 않는다. */
  stageAt?: StageAt;
  /** 잡아둔 시간. null을 보내면 해제한다. */
  slot?: Slot | null;
}

/** 단계 시각은 덮어쓰지 않고 쌓는다. 나중 전환이 앞선 기록을 지우면 안 된다. */
function mergeStage(cur: StoredTask, patch: TaskPatch): StoredTask {
  const next = { ...cur, ...patch } as StoredTask;
  if (patch.stageAt) next.stageAt = { ...cur.stageAt, ...patch.stageAt };
  /*
   * 시간 해제는 null로 온다. 그대로 두면 slot:null이 저장돼
   * "잡힌 시간이 있는데 값이 비어 있음"이 되므로 필드째 지운다.
   */
  if (patch.slot === null) delete next.slot;

  /*
   * 사람이 고친 항목을 표시한다. 값이 실제로 달라졌을 때만 — 같은 값을
   * 다시 고른 것까지 세면 "고친 비율"이 부풀어 품질 신호가 못 된다.
   */
  const edited = { ...cur.edited };
  if (patch.role && patch.role !== cur.role) edited.role = true;
  if (patch.priority && patch.priority !== cur.priority) edited.priority = true;
  if (patch.assignee && patch.assignee !== cur.assignee) edited.assignee = true;
  if (Object.keys(edited).length) next.edited = edited;

  return next;
}

export interface Store {
  /** 실제로 어디에 저장되고 있는지 (화면에 표시해 오해를 막는다) */
  kind: "redis" | "memory";
  listTasks(): Promise<StoredTask[]>;
  addTasks(tasks: StoredTask[]): Promise<void>;
  updateTask(id: string, patch: TaskPatch): Promise<StoredTask | null>;
  clearTasks(): Promise<void>;
  getCursor(key: string): Promise<string | null>;
  setCursor(key: string, value: string): Promise<void>;
  /** 같은 메시지를 두 번 처리하지 않도록. 처음 보는 키면 true. */
  markIfUnseen(key: string): Promise<boolean>;
  /**
   * 처리에 실패했을 때 표시를 도로 거둔다.
   * 거두지 않으면 "이미 처리함"으로 남아 그 메시지는 영영 다시 읽히지 않는다.
   */
  unmark(key: string): Promise<void>;
  /** 화면 오른쪽 메모. 없으면 빈 문자열. */
  getNotes(): Promise<string>;
  setNotes(text: string): Promise<void>;
}

const TASKS_KEY = "tasks:v1";
const NOTES_KEY = "notes:v1";
/** 메모는 메모지지 문서가 아니다. 길이를 막아 저장소가 부풀지 않게 한다. */
export const NOTES_MAX = 4000;
const SEEN_TTL_SECONDS = 60 * 60 * 24 * 14;

/* ---------------- 메모리 (설정이 없을 때의 강등 경로) ---------------- */

/**
 * 서버리스에서는 인스턴스마다 따로 놀고 언제든 사라진다.
 * 저장소를 붙이기 전에도 앱이 죽지 않게 하려는 용도일 뿐,
 * 실제 운영 상태로 착각하면 안 된다. (kind: "memory"로 화면에 드러낸다)
 */
const mem = {
  tasks: new Map<string, StoredTask>(),
  cursors: new Map<string, string>(),
  seen: new Set<string>(),
  notes: "",
};

const memoryStore: Store = {
  kind: "memory",
  async listTasks() {
    return Array.from(mem.tasks.values());
  },
  async addTasks(tasks) {
    for (const t of tasks) mem.tasks.set(t.id, t);
  },
  async updateTask(id, patch) {
    const cur = mem.tasks.get(id);
    if (!cur) return null;
    const next = mergeStage(cur, patch);
    mem.tasks.set(id, next);
    return next;
  },
  async clearTasks() {
    mem.tasks.clear();
  },
  async getCursor(key) {
    return mem.cursors.get(key) ?? null;
  },
  async setCursor(key, value) {
    mem.cursors.set(key, value);
  },
  async markIfUnseen(key) {
    if (mem.seen.has(key)) return false;
    mem.seen.add(key);
    return true;
  },
  async unmark(key) {
    mem.seen.delete(key);
  },
  async getNotes() {
    return mem.notes;
  },
  async setNotes(text) {
    mem.notes = text;
  },
};

/* ---------------- Redis (Upstash REST) ---------------- */

function redisConfig(): { url: string; token: string } | null {
  // Vercel의 Upstash 연동은 KV_ 접두사로, 직접 만든 경우는 UPSTASH_ 로 들어온다.
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";
  const clean = (s: string) => s.trim().replace(/^["']|["']$/g, "");
  return clean(url) && clean(token)
    ? { url: clean(url).replace(/\/$/, ""), token: clean(token) }
    : null;
}

async function redisCommand(
  cfg: { url: string; token: string },
  command: (string | number)[],
): Promise<unknown> {
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Redis ${command[0]} 실패 (${res.status})`);
  }
  const body = (await res.json()) as { result?: unknown; error?: string };
  if (body.error) throw new Error(`Redis ${command[0]}: ${body.error}`);
  return body.result;
}

function makeRedisStore(cfg: { url: string; token: string }): Store {
  return {
    kind: "redis",
    async listTasks() {
      const raw = (await redisCommand(cfg, ["HVALS", TASKS_KEY])) as
        | string[]
        | null;
      if (!raw) return [];
      const out: StoredTask[] = [];
      for (const s of raw) {
        try {
          out.push(JSON.parse(s) as StoredTask);
        } catch {
          // 손상된 항목 하나가 대시보드 전체를 막지 않게 한다.
        }
      }
      return out;
    },
    async addTasks(tasks) {
      if (!tasks.length) return;
      const args: string[] = [];
      for (const t of tasks) args.push(t.id, JSON.stringify(t));
      await redisCommand(cfg, ["HSET", TASKS_KEY, ...args]);
    },
    async updateTask(id, patch) {
      const raw = (await redisCommand(cfg, ["HGET", TASKS_KEY, id])) as
        | string
        | null;
      if (!raw) return null;
      const next = mergeStage(JSON.parse(raw) as StoredTask, patch);
      await redisCommand(cfg, ["HSET", TASKS_KEY, id, JSON.stringify(next)]);
      return next;
    },
    async clearTasks() {
      await redisCommand(cfg, ["DEL", TASKS_KEY]);
    },
    async getCursor(key) {
      return (await redisCommand(cfg, ["GET", `cursor:${key}`])) as
        | string
        | null;
    },
    async setCursor(key, value) {
      await redisCommand(cfg, ["SET", `cursor:${key}`, value]);
    },
    async markIfUnseen(key) {
      const res = await redisCommand(cfg, [
        "SET",
        `seen:${key}`,
        "1",
        "NX",
        "EX",
        SEEN_TTL_SECONDS,
      ]);
      return res === "OK";
    },
    async unmark(key) {
      await redisCommand(cfg, ["DEL", `seen:${key}`]);
    },
    async getNotes() {
      const v = (await redisCommand(cfg, ["GET", NOTES_KEY])) as string | null;
      return v ?? "";
    },
    async setNotes(text) {
      await redisCommand(cfg, ["SET", NOTES_KEY, text]);
    },
  };
}

/* ---------------- 선택 ---------------- */

let cached: Store | null = null;

export function getStore(): Store {
  if (cached) return cached;
  const cfg = redisConfig();
  cached = cfg ? makeRedisStore(cfg) : memoryStore;
  return cached;
}

/** 테스트에서 설정을 바꿔가며 확인하기 위한 용도. */
export function resetStoreCache() {
  cached = null;
}
