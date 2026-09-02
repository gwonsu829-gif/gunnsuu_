import { todayISO, weekdayKo } from "./dates";
import { GeminiError, geminiJson } from "./gemini";
import { GoogleError, getConnection, googleFetch } from "./google";
import { storeExtracted } from "./ingest";
import { normalizeTasks } from "./parse";
import { MAIL_LABELS, applyKeywordRules, gmailLabelName } from "./settings";
import { getStore } from "./store";
import { MailLabel, MailRecord, PRIORITIES, ROLES, Settings } from "./types";
import { checkQuota, recordCall } from "./usage";

/**
 * Gmail → 라벨 → 할일.
 *
 * 흐름:  Gmail에서 새 메일을 읽는다 → 키워드 규칙을 먼저 건다 → Gemini가 라벨·요약·할일을 뽑는다
 *        → 대시보드에 저장한다 → Gmail에도 "업무/CS" 같은 라벨을 실제로 붙인다.
 *
 * Gmail에 라벨을 되돌려 붙이는 이유: 대시보드가 죽어도 메일함에서 필터가 된다.
 * 대시보드만 알고 있는 분류는 대시보드가 안 열리는 날 아무 소용이 없다.
 */

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const LAST_SYNC_KEY = "mail:lastSync";
/** 설정의 간격을 못 읽었을 때 쓸 기본값(분). 평소에는 settings.syncMinutes를 쓴다. */
const FALLBACK_SYNC_MINUTES = 10;
/** 한 번에 처리할 최대 통수. 서버리스 실행 시간 안에 끝나야 한다. */
const MAX_PER_RUN = 20;
const MAX_BODY_CHARS = 6000;

export interface MailSyncReport {
  ok: boolean;
  /** 왜 안 돌았는지 (연결 없음, 너무 이름 등) */
  skipped?: string;
  fetched: number;
  classified: number;
  tasksAdded: number;
  labeled: number;
  failed: { id: string; subject: string; reason: string }[];
  at: string;
  /** 오늘 AI를 몇 번 썼는지 / 상한 (0이면 상한 없음) */
  사용량?: { 오늘: number; 상한: number };
}

/* ---------------- Gmail 읽기 ---------------- */

interface GmailHeader {
  name: string;
  value: string;
}
interface GmailPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: GmailHeader[];
}
interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: GmailPart;
}

function b64url(data: string): string {
  const s = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(s, "base64").toString("utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** text/plain을 먼저 찾고, 없으면 html을 벗긴다. 첨부는 본다고 해서 얻을 게 없다. */
export function extractBody(part: GmailPart | undefined): string {
  if (!part) return "";
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (p: GmailPart) => {
    if (p.body?.data) {
      if (p.mimeType === "text/plain") plain.push(b64url(p.body.data));
      else if (p.mimeType === "text/html") html.push(b64url(p.body.data));
    }
    for (const c of p.parts ?? []) walk(c);
  };
  walk(part);
  const text = plain.join("\n").trim() || stripHtml(html.join("\n"));
  return text.slice(0, MAX_BODY_CHARS);
}

function header(msg: GmailMessage, name: string): string {
  return (
    msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ""
  );
}

/* ---------------- Gmail 라벨 ---------------- */

interface GmailLabel {
  id: string;
  name: string;
}

/** 이름→id. 없는 라벨은 만든다. 실행마다 한 번만 조회한다. */
async function labelIndex(settings: Settings): Promise<Map<string, string>> {
  const res = await googleFetch<{ labels?: GmailLabel[] }>(`${GMAIL}/labels`);
  const map = new Map<string, string>();
  for (const l of res.labels ?? []) map.set(l.name, l.id);

  // 상위 라벨("업무")이 먼저 있어야 "업무/CS"가 접혀 들어간다.
  const ensure = async (name: string) => {
    if (map.has(name)) return;
    const created = await googleFetch<GmailLabel>(`${GMAIL}/labels`, {
      method: "POST",
      body: { name, labelListVisibility: "labelShow", messageListVisibility: "show" },
    });
    map.set(name, created.id);
  };
  await ensure(settings.labelPrefix);
  for (const label of MAIL_LABELS) await ensure(gmailLabelName(settings.labelPrefix, label));
  return map;
}

async function applyGmailLabels(
  msgId: string,
  labels: MailLabel[],
  settings: Settings,
  index: Map<string, string>,
  previous: MailLabel[] = [],
): Promise<void> {
  const add = labels
    .map((l) => index.get(gmailLabelName(settings.labelPrefix, l)))
    .filter((id): id is string => Boolean(id));
  const remove = previous
    .filter((l) => !labels.includes(l))
    .map((l) => index.get(gmailLabelName(settings.labelPrefix, l)))
    .filter((id): id is string => Boolean(id));
  if (!add.length && !remove.length) return;
  await googleFetch(`${GMAIL}/messages/${msgId}/modify`, {
    method: "POST",
    body: { addLabelIds: add, removeLabelIds: remove },
  });
}

/* ---------------- Gemini 분류 ---------------- */

function classifyPrompt(today: string): string {
  return `너는 3인 규모 스타트업의 업무 비서다. 메일 한 통을 읽고 아래 JSON 객체 하나만 출력한다.

{
  "labels": ["${MAIL_LABELS.join('" | "')}"],   // 1~2개. 이 메일이 속한 직무. 업무와 무관하면 ["참고"]
  "actionable": true | false,                  // 우리 쪽 누군가가 실제로 움직여야 하는 메일인지
  "summary": "한 문장 요약 (40자 이내)",
  "tasks": [{
    "title": "동사로 끝나는 한 줄 액션",
    "role": "${ROLES.join("|")}",
    "priority": "${PRIORITIES.join("|")}",
    "dueDate": "YYYY-MM-DD 또는 '미정'",
    "assignee": "본문에서 유추 가능하면 이름, 아니면 '미지정'",
    "source": "판단 근거가 된 원문 문장 그대로",
    "status": "미처리"
  }]
}

규칙:
- 출력은 JSON 객체 하나뿐이다. 설명, 머리말, 마크다운 코드펜스를 절대 붙이지 않는다.
- 오늘은 ${today}(${weekdayKo(today)}요일)이다. 상대 날짜는 오늘 기준 YYYY-MM-DD로 바꾼다. 모르면 "미정".
- 뉴스레터·광고·자동 알림·단순 공지는 actionable=false, tasks=[], labels=["참고"].
- actionable=false면 tasks는 빈 배열이다.
- source는 원문에 실제로 있는 문장을 글자 그대로 복사한다. 요약하거나 지어내지 않는다.
- 할일을 나누는 기준은 산출물이다. 결과물이 다르면 별건, 하나의 결과물로 가는 단계면 한 건.
- 서류·자료가 여러 개 나열되면 각각 빠뜨리지 않는다.`;
}

interface Classified {
  labels: MailLabel[];
  actionable: boolean;
  summary: string;
  tasks: ReturnType<typeof normalizeTasks>;
}

export function readClassified(raw: string): Classified {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 코드펜스가 붙어 오는 경우를 한 번 더 시도한다.
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new GeminiError("Gemini 응답에서 JSON 객체를 찾지 못했습니다.");
    parsed = JSON.parse(m[0]);
  }
  const o = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<
    string,
    unknown
  >;
  const labels = (Array.isArray(o.labels) ? o.labels : [])
    .filter((l): l is MailLabel => (MAIL_LABELS as readonly string[]).includes(String(l)))
    .slice(0, 2);
  const actionable = o.actionable === true;
  const tasks = actionable && Array.isArray(o.tasks) ? normalizeTasks(o.tasks) : [];
  return {
    labels: labels.length ? labels : ["참고"],
    actionable,
    summary: typeof o.summary === "string" ? o.summary.trim().slice(0, 80) : "",
    tasks,
  };
}

/* ---------------- 동기화 본체 ---------------- */

export async function lastSyncAt(): Promise<string | null> {
  return (await getStore().getJSON<{ at: string }>(LAST_SYNC_KEY))?.at ?? null;
}

/**
 * force=false면 최근 5분 안에 돌았을 때 건너뛴다.
 * 화면이 30초마다 부르는 자동 경로는 이 문턱을 지키고, 버튼은 force로 뚫는다.
 */
export async function syncMail(opts: { force?: boolean } = {}): Promise<MailSyncReport> {
  const store = getStore();
  const at = new Date().toISOString();
  const empty = (skipped: string): MailSyncReport => ({
    ok: false,
    skipped,
    fetched: 0,
    classified: 0,
    tasksAdded: 0,
    labeled: 0,
    failed: [],
    at,
  });

  if (!(await getConnection())) return empty("구글 계정이 연결되어 있지 않습니다.");

  const settingsForGuard = await store.getSettings();
  if (!opts.force) {
    const last = await lastSyncAt();
    const 간격 = (settingsForGuard.syncMinutes || FALLBACK_SYNC_MINUTES) * 60_000;
    if (last && Date.now() - Date.parse(last) < 간격) {
      return empty("최근에 동기화했습니다.");
    }
  }
  // 두 브라우저가 동시에 부르면 같은 메일을 두 번 분류한다. 먼저 찍은 쪽만 돈다.
  await store.setJSON(LAST_SYNC_KEY, { at });

  const settings = settingsForGuard;
  const today = todayISO();
  /*
   * 메일 한 통마다 Gemini를 한 번 부른다. 상한에 닿으면 남은 메일은 처리 표시를 남기지 않고
   * 넘어가 다음 실행에서 다시 읽힌다 — 분류가 밀릴 뿐 메일이 사라지지는 않는다.
   */
  let quota = await checkQuota(settings.aiDailyLimit);
  const report: MailSyncReport = {
    ok: true,
    fetched: 0,
    classified: 0,
    tasksAdded: 0,
    labeled: 0,
    failed: [],
    at,
  };

  let ids: { id: string }[];
  try {
    const list = await googleFetch<{ messages?: { id: string; threadId: string }[] }>(
      `${GMAIL}/messages`,
      { query: { q: settings.mailQuery, maxResults: String(MAX_PER_RUN * 2) } },
    );
    ids = list.messages ?? [];
  } catch (e) {
    return { ...empty(e instanceof GoogleError ? e.message : "Gmail 목록을 읽지 못했습니다."), ok: false };
  }

  let index: Map<string, string> | null = null;
  const fresh: MailRecord[] = [];

  for (const { id } of ids) {
    if (fresh.length >= MAX_PER_RUN) break;
    if (quota.exhausted) {
      report.failed.push({
        id,
        subject: "",
        reason: `오늘 AI 호출 상한(${quota.limit}회)에 닿아 다음에 이어서 읽습니다`,
      });
      break;
    }
    // 이미 본 메일은 건너뛴다. (라벨을 고친 뒤 다시 읽어도 사람이 고친 값이 덮이지 않게.)
    if (!(await store.markIfUnseen(`gmail:${id}`))) continue;

    let msg: GmailMessage;
    try {
      msg = await googleFetch<GmailMessage>(`${GMAIL}/messages/${id}`, {
        query: { format: "full" },
      });
    } catch (e) {
      await store.unmark(`gmail:${id}`);
      report.failed.push({ id, subject: "", reason: e instanceof Error ? e.message : "읽기 실패" });
      continue;
    }
    report.fetched += 1;

    const subject = header(msg, "Subject") || "(제목 없음)";
    const from = header(msg, "From");
    const body = extractBody(msg.payload);
    const receivedAt = msg.internalDate
      ? new Date(Number(msg.internalDate)).toISOString()
      : new Date().toISOString();

    // 1) 규칙. 사람이 정한 것이 AI보다 앞선다.
    const forced = applyKeywordRules(settings.keywordRules, subject, body);

    // 2) Gemini.
    let classified: Classified;
    try {
      await recordCall("collect");
      quota = await checkQuota(settings.aiDailyLimit);
      const raw = await geminiJson(
        classifyPrompt(today),
        `보낸사람: ${from}\n제목: ${subject}\n\n${body || msg.snippet || ""}`,
      );
      classified = readClassified(raw);
    } catch (e) {
      /*
       * 실패한 메일은 표시를 거두고 다음 실행에서 다시 읽는다.
       * 추측 라벨을 붙이고 소비해 버리면 그 메일은 영영 잘못 분류된 채로 남는다.
       * (lib/ingest.ts와 같은 원칙)
       */
      await store.unmark(`gmail:${id}`);
      report.failed.push({
        id,
        subject,
        reason: e instanceof GeminiError ? e.message : "분류 실패",
      });
      continue;
    }
    report.classified += 1;

    // 규칙이 "참고"라고 했으면 할일도 만들지 않는다 — 뉴스레터에서 할일이 나오면 그게 오류다.
    const isReference = forced.includes("참고");
    const labels: MailLabel[] = isReference
      ? ["참고"]
      : Array.from(new Set([...forced, ...classified.labels.filter((l) => l !== "참고")]));
    const finalLabels: MailLabel[] = labels.length ? labels : ["참고"];
    const actionable = !isReference && classified.actionable;

    // 3) 할일 저장.
    let taskIds: string[] = [];
    if (actionable && classified.tasks.length) {
      const text = [`보낸사람: ${from}`, `제목: ${subject}`, "", body].join("\n");
      const { fresh: added } = await storeExtracted(classified.tasks, {
        channel: "email",
        sourceLabel: subject,
        rawText: text,
        receivedAt,
        mailId: id,
      });
      taskIds = added.map((t) => t.id);
      report.tasksAdded += added.length;
    }

    // 4) Gmail에 라벨. 실패해도 대시보드 기록은 남긴다.
    let gmailLabeled = false;
    try {
      index = index ?? (await labelIndex(settings));
      await applyGmailLabels(id, finalLabels, settings, index);
      gmailLabeled = true;
      report.labeled += 1;
    } catch (e) {
      console.error("[mail] Gmail 라벨 실패:", e instanceof Error ? e.message : e);
    }

    fresh.push({
      id,
      threadId: msg.threadId,
      from,
      subject,
      snippet: (msg.snippet ?? body.slice(0, 160)).trim(),
      receivedAt,
      labels: finalLabels,
      forced,
      actionable,
      summary: classified.summary,
      taskIds,
      classifiedBy: forced.length && !classified.labels.length ? "rule" : "gemini",
      gmailLabeled,
      syncedAt: at,
    });
  }

  await store.upsertMails(fresh);
  report.사용량 = { 오늘: quota.used, 상한: quota.limit };
  return report;
}

/** 사람이 라벨을 고쳤을 때. 대시보드와 Gmail 양쪽에 반영한다. */
export async function relabelMail(
  id: string,
  labels: MailLabel[],
): Promise<{ ok: true; mail: MailRecord } | { ok: false; error: string }> {
  const store = getStore();
  const mail = await store.getMail(id);
  if (!mail) return { ok: false, error: "해당 메일을 찾을 수 없습니다." };
  const clean = labels.filter((l) => (MAIL_LABELS as readonly string[]).includes(l));
  const next: MailRecord = {
    ...mail,
    labels: clean.length ? clean : ["참고"],
    classifiedBy: "person",
  };
  let gmailLabeled = mail.gmailLabeled;
  try {
    const settings = await store.getSettings();
    const index = await labelIndex(settings);
    await applyGmailLabels(id, next.labels, settings, index, mail.labels);
    gmailLabeled = true;
  } catch (e) {
    console.error("[mail] Gmail 라벨 수정 실패:", e instanceof Error ? e.message : e);
    gmailLabeled = false;
  }
  next.gmailLabeled = gmailLabeled;
  await store.upsertMails([next]);
  return { ok: true, mail: next };
}
