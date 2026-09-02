import { normalizeSettings } from "./settings";
import {
  AuditEntry,
  ExtractedTask,
  MailRecord,
  Role,
  Settings,
  Slot,
  StageAt,
  Status,
} from "./types";

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
  /** 저장될 때마다 1씩 오른다. 동시 수정 감지용. */
  version?: number;
  updatedAt?: string;
  updatedBy?: string;
  calendarEventId?: string;
  mailId?: string;
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
  /** 캘린더 연동이 채운다. null이면 끊는다. */
  calendarEventId?: string | null;
  /** 중복 처리: 어느 건으로 합쳤는지. null이면 "중복 아님"으로 되돌린다. */
  duplicateOf?: string | null;
}

export interface UpdateOptions {
  /** 화면이 마지막으로 본 판. 저장된 판과 다르면 거절한다. */
  expectedVersion?: number;
  /** 누가 고쳤는지 */
  by?: string;
}

export type UpdateResult =
  | { ok: true; task: StoredTask }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "conflict"; current: StoredTask };

/** 단계 시각은 덮어쓰지 않고 쌓는다. 나중 전환이 앞선 기록을 지우면 안 된다. */
function mergeStage(cur: StoredTask, patch: TaskPatch, by?: string): StoredTask {
  const next = { ...cur, ...patch } as StoredTask;
  if (patch.stageAt) next.stageAt = { ...cur.stageAt, ...patch.stageAt };
  /*
   * 해제는 null로 온다. 그대로 두면 slot:null이 저장돼
   * "잡힌 시간이 있는데 값이 비어 있음"이 되므로 필드째 지운다.
   */
  if (patch.slot === null) delete next.slot;
  if (patch.calendarEventId === null) delete next.calendarEventId;
  if (patch.duplicateOf === null) delete next.duplicateOf;

  /*
   * 사람이 고친 항목을 표시한다. 값이 실제로 달라졌을 때만 — 같은 값을
   * 다시 고른 것까지 세면 "고친 비율"이 부풀어 품질 신호가 못 된다.
   */
  const edited = { ...cur.edited };
  if (patch.role && patch.role !== cur.role) edited.role = true;
  if (patch.priority && patch.priority !== cur.priority) edited.priority = true;
  if (patch.assignee && patch.assignee !== cur.assignee) edited.assignee = true;
  if (Object.keys(edited).length) next.edited = edited;

  next.version = (cur.version ?? 0) + 1;
  next.updatedAt = new Date().toISOString();
  if (by) next.updatedBy = by;

  return next;
}

export interface Store {
  /** 실제로 어디에 저장되고 있는지 (화면에 표시해 오해를 막는다) */
  kind: "redis" | "memory";
  listTasks(): Promise<StoredTask[]>;
  getTask(id: string): Promise<StoredTask | null>;
  addTasks(tasks: StoredTask[]): Promise<void>;
  updateTask(id: string, patch: TaskPatch, opts?: UpdateOptions): Promise<UpdateResult>;
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

  /** 작은 JSON 값 (구글 토큰, 캘린더 동기화 토큰 등) */
  getJSON<T>(key: string): Promise<T | null>;
  setJSON(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;

  listMails(): Promise<MailRecord[]>;
  getMail(id: string): Promise<MailRecord | null>;
  upsertMails(mails: MailRecord[]): Promise<void>;

  getSettings(): Promise<Settings>;
  setSettings(settings: Settings): Promise<void>;

  /** 최근 것이 앞에 온다. */
  listAudit(limit: number): Promise<AuditEntry[]>;
  pushAudit(entry: AuditEntry): Promise<void>;
}

const TASKS_KEY = "tasks:v1";
const NOTES_KEY = "notes:v1";
const MAILS_KEY = "mails:v1";
const SETTINGS_KEY = "settings:v1";
const AUDIT_KEY = "audit:v1";
/** 메모는 메모지지 문서가 아니다. 길이를 막아 저장소가 부풀지 않게 한다. */
export const NOTES_MAX = 4000;
/** 이력은 최근 것만. 감사 로그가 아니라 "방금 누가 뭘 했나"를 보는 용도다. */
const AUDIT_MAX = 400;
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
  json: new Map<string, unknown>(),
  mails: new Map<string, MailRecord>(),
  settings: null as Settings | null,
  audit: [] as AuditEntry[],
};

function applyUpdate(cur: StoredTask, patch: TaskPatch, opts?: UpdateOptions): UpdateResult {
  if (
    opts?.expectedVersion !== undefined &&
    (cur.version ?? 0) !== opts.expectedVersion
  ) {
    return { ok: false, reason: "conflict", current: cur };
  }
  return { ok: true, task: mergeStage(cur, patch, opts?.by) };
}

const memoryStore: Store = {
  kind: "memory",
  async listTasks() {
    return Array.from(mem.tasks.values());
  },
  async getTask(id) {
    return mem.tasks.get(id) ?? null;
  },
  async addTasks(tasks) {
    for (const t of tasks) mem.tasks.set(t.id, t);
  },
  async updateTask(id, patch, opts) {
    const cur = mem.tasks.get(id);
    if (!cur) return { ok: false, reason: "not-found" };
    const res = applyUpdate(cur, patch, opts);
    if (res.ok) mem.tasks.set(id, res.task);
    return res;
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
  async getJSON<T>(key: string) {
    return (mem.json.get(key) as T | undefined) ?? null;
  },
  async setJSON(key, value) {
    mem.json.set(key, value);
  },
  async del(key) {
    mem.json.delete(key);
  },
  async listMails() {
    return Array.from(mem.mails.values());
  },
  async getMail(id) {
    return mem.mails.get(id) ?? null;
  },
  async upsertMails(mails) {
    for (const m of mails) mem.mails.set(m.id, m);
  },
  async getSettings() {
    return mem.settings ?? normalizeSettings(null);
  },
  async setSettings(settings) {
    mem.settings = settings;
  },
  async listAudit(limit) {
    return mem.audit.slice(0, limit);
  },
  async pushAudit(entry) {
    mem.audit.unshift(entry);
    if (mem.audit.length > AUDIT_MAX) mem.audit.length = AUDIT_MAX;
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

function parseAll<T>(raw: string[] | null): T[] {
  if (!raw) return [];
  const out: T[] = [];
  for (const s of raw) {
    try {
      out.push(JSON.parse(s) as T);
    } catch {
      // 손상된 항목 하나가 대시보드 전체를 막지 않게 한다.
    }
  }
  return out;
}

function makeRedisStore(cfg: { url: string; token: string }): Store {
  const hget = async <T>(hash: string, id: string): Promise<T | null> => {
    const raw = (await redisCommand(cfg, ["HGET", hash, id])) as string | null;
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };

  return {
    kind: "redis",
    async listTasks() {
      return parseAll<StoredTask>(
        (await redisCommand(cfg, ["HVALS", TASKS_KEY])) as string[] | null,
      );
    },
    async getTask(id) {
      return hget<StoredTask>(TASKS_KEY, id);
    },
    async addTasks(tasks) {
      if (!tasks.length) return;
      const args: string[] = [];
      for (const t of tasks) args.push(t.id, JSON.stringify(t));
      await redisCommand(cfg, ["HSET", TASKS_KEY, ...args]);
    },
    async updateTask(id, patch, opts) {
      /*
       * 읽고-비교하고-쓰는 사이에 다른 사람이 끼어들 틈이 아주 짧게 있다.
       * 세 명이 같은 카드를 같은 초에 만지는 경우는 사실상 없어 낙관적 검사로 충분하다.
       * WATCH/MULTI를 REST 한 번에 태울 수 없기도 하다.
       */
      const cur = await hget<StoredTask>(TASKS_KEY, id);
      if (!cur) return { ok: false, reason: "not-found" };
      const res = applyUpdate(cur, patch, opts);
      if (res.ok) {
        await redisCommand(cfg, ["HSET", TASKS_KEY, id, JSON.stringify(res.task)]);
      }
      return res;
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
    async getJSON<T>(key: string) {
      const v = (await redisCommand(cfg, ["GET", `json:${key}`])) as string | null;
      if (!v) return null;
      try {
        return JSON.parse(v) as T;
      } catch {
        return null;
      }
    },
    async setJSON(key, value) {
      await redisCommand(cfg, ["SET", `json:${key}`, JSON.stringify(value)]);
    },
    async del(key) {
      await redisCommand(cfg, ["DEL", `json:${key}`]);
    },
    async listMails() {
      return parseAll<MailRecord>(
        (await redisCommand(cfg, ["HVALS", MAILS_KEY])) as string[] | null,
      );
    },
    async getMail(id) {
      return hget<MailRecord>(MAILS_KEY, id);
    },
    async upsertMails(mails) {
      if (!mails.length) return;
      const args: string[] = [];
      for (const m of mails) args.push(m.id, JSON.stringify(m));
      await redisCommand(cfg, ["HSET", MAILS_KEY, ...args]);
    },
    async getSettings() {
      const v = (await redisCommand(cfg, ["GET", SETTINGS_KEY])) as string | null;
      if (!v) return normalizeSettings(null);
      try {
        return normalizeSettings(JSON.parse(v));
      } catch {
        return normalizeSettings(null);
      }
    },
    async setSettings(settings) {
      await redisCommand(cfg, ["SET", SETTINGS_KEY, JSON.stringify(settings)]);
    },
    async listAudit(limit) {
      return parseAll<AuditEntry>(
        (await redisCommand(cfg, ["LRANGE", AUDIT_KEY, 0, limit - 1])) as
          | string[]
          | null,
      );
    },
    async pushAudit(entry) {
      await redisCommand(cfg, ["LPUSH", AUDIT_KEY, JSON.stringify(entry)]);
      await redisCommand(cfg, ["LTRIM", AUDIT_KEY, 0, AUDIT_MAX - 1]);
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
