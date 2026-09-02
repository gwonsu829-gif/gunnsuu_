import { GoogleError, getConnection, googleFetch } from "./google";
import { readSlot } from "./slot";
import { StoredTask, getStore } from "./store";
import { BusyEvent, Slot } from "./types";

/**
 * 구글 캘린더 양방향 동기화.
 *
 *  대시보드 → 캘린더 : 시간을 잡으면(slot) 이벤트를 만들고, 옮기면 고치고, 비우면 지운다.
 *  캘린더 → 대시보드 : 캘린더에서 옮기거나 지운 것을 syncToken으로 받아 slot에 되돌린다.
 *
 * 어느 쪽이 진실인가: 마지막으로 손댄 쪽이다. 두 곳을 같은 시각에 고치는 일은
 * 3인 팀에서 사실상 없고, 있더라도 "누가 마지막에 옮겼나"가 사람이 이해할 수 있는 규칙이다.
 *
 * 이벤트에 opsTaskId를 숨겨 두어 우리가 만든 것만 되돌린다. 남의 회의를 할일로 바꾸지 않는다.
 */

const CAL = "https://www.googleapis.com/calendar/v3";
const SYNC_TOKEN_KEY = "calendar:syncToken";
const TASK_PROP = "opsTaskId";

function calendarId(): string {
  return (process.env.GOOGLE_CALENDAR_ID ?? "").trim() || "primary";
}

function base(): string {
  return `${CAL}/calendars/${encodeURIComponent(calendarId())}/events`;
}

interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
  updated?: string;
}

export async function calendarConnected(): Promise<boolean> {
  return Boolean(await getConnection());
}

function eventBody(task: StoredTask, slot: Slot) {
  const who = task.assignee && task.assignee !== "미지정" ? ` · ${task.assignee}` : "";
  return {
    summary: `[${task.role}] ${task.title}${who}`,
    description: [
      `담당: ${task.assignee}`,
      `기한: ${task.dueDate}`,
      `우선순위: ${task.priority}`,
      task.sourceLabel ? `출처: ${task.sourceLabel}` : "",
      "",
      "— 업무 대시보드에서 만든 일정입니다. 여기서 옮기거나 지우면 대시보드에도 반영됩니다.",
    ]
      .filter((l) => l !== "")
      .join("\n"),
    start: { dateTime: slot.start, timeZone: "Asia/Seoul" },
    end: { dateTime: slot.end, timeZone: "Asia/Seoul" },
    extendedProperties: { private: { [TASK_PROP]: task.id } },
  };
}

/**
 * slot을 캘린더에 올린다. 이미 올라가 있으면 고친다.
 * 이벤트가 캘린더에서 지워진 뒤라면(404) 새로 만든다.
 * 돌려주는 값은 이벤트 id — 부르는 쪽이 할일에 적어 둔다.
 */
export async function pushSlot(task: StoredTask, slot: Slot): Promise<string> {
  if (task.calendarEventId) {
    try {
      const ev = await googleFetch<GEvent>(`${base()}/${encodeURIComponent(task.calendarEventId)}`, {
        method: "PATCH",
        body: eventBody(task, slot),
      });
      return ev.id;
    } catch (e) {
      if (!(e instanceof GoogleError && (e.status === 404 || e.status === 410))) throw e;
    }
  }
  const ev = await googleFetch<GEvent>(base(), { method: "POST", body: eventBody(task, slot) });
  return ev.id;
}

/** 이미 없어진 이벤트를 지우는 건 성공으로 본다. */
export async function removeEvent(eventId: string): Promise<void> {
  try {
    await googleFetch(`${base()}/${encodeURIComponent(eventId)}`, { method: "DELETE" });
  } catch (e) {
    if (e instanceof GoogleError && (e.status === 404 || e.status === 410)) return;
    throw e;
  }
}

/* ---------------- 캘린더 → 대시보드 ---------------- */

export interface PullReport {
  ok: boolean;
  skipped?: string;
  /** 캘린더에서 옮겨져 slot이 바뀐 할일 */
  moved: string[];
  /** 캘린더에서 지워져 slot이 풀린 할일 */
  cleared: string[];
  /** 처음부터 다시 받았는지 (토큰 만료) */
  reset: boolean;
}

/**
 * 마지막 동기화 이후 바뀐 이벤트만 받는다.
 * 토큰이 없거나 만료(410)면 최근 30일을 한 번 훑고 새 토큰을 받는다.
 */
export async function pullChanges(): Promise<PullReport> {
  const store = getStore();
  if (!(await getConnection())) {
    return { ok: false, skipped: "구글 계정이 연결되어 있지 않습니다.", moved: [], cleared: [], reset: false };
  }

  let token = (await store.getJSON<{ token: string }>(SYNC_TOKEN_KEY))?.token ?? null;
  let reset = false;
  const changed: GEvent[] = [];

  const page = async (pageToken?: string): Promise<string | undefined> => {
    /*
     * syncToken을 쓸 때는 처음 요청과 같은 조건이어야 한다(구글 규칙). timeMin만 빠진다.
     * 우리 이벤트가 아닌 것은 아래에서 opsTaskId로 걸러낸다.
     */
    const shared: Record<string, string | undefined> = {
      singleEvents: "true",
      showDeleted: "true",
      maxResults: "250",
      pageToken,
    };
    const query: Record<string, string | undefined> = token
      ? { ...shared, syncToken: token }
      : { ...shared, timeMin: new Date(Date.now() - 30 * 86400_000).toISOString() };
    const res = await googleFetch<{
      items?: GEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    }>(base(), { query });
    changed.push(...(res.items ?? []));
    if (res.nextSyncToken) {
      await store.setJSON(SYNC_TOKEN_KEY, { token: res.nextSyncToken });
    }
    return res.nextPageToken;
  };

  try {
    let next = await page();
    while (next) next = await page(next);
  } catch (e) {
    if (e instanceof GoogleError && e.status === 410 && token) {
      // 토큰이 낡았다. 버리고 처음부터.
      await store.del(SYNC_TOKEN_KEY);
      token = null;
      reset = true;
      let next = await page();
      while (next) next = await page(next);
    } else {
      return {
        ok: false,
        skipped: e instanceof Error ? e.message : "캘린더를 읽지 못했습니다.",
        moved: [],
        cleared: [],
        reset,
      };
    }
  }

  const report: PullReport = { ok: true, moved: [], cleared: [], reset };

  for (const ev of changed) {
    const taskId = ev.extendedProperties?.private?.[TASK_PROP];
    if (!taskId) continue;
    const task = await store.getTask(taskId);
    if (!task) continue;

    if (ev.status === "cancelled") {
      // 우리가 만든 이벤트가 캘린더에서 지워졌다 → 시간을 푼다. 다른 이벤트로 이미 갈아탔으면 건드리지 않는다.
      if (task.calendarEventId === ev.id && task.slot) {
        await store.updateTask(taskId, { slot: null, calendarEventId: null }, { by: "구글 캘린더" });
        report.cleared.push(taskId);
      }
      continue;
    }

    const slot = readSlot({ start: ev.start?.dateTime, end: ev.end?.dateTime });
    if (!slot) continue; // 종일 이벤트로 바꾼 경우 등. 시간이 없으면 slot으로 못 받는다.
    const same =
      task.slot && task.slot.start === slot.start && task.slot.end === slot.end;
    if (same && task.calendarEventId === ev.id) continue;

    await store.updateTask(taskId, { slot, calendarEventId: ev.id }, { by: "구글 캘린더" });
    report.moved.push(taskId);
  }

  return report;
}

/* ---------------- 다른 일정 (겹침 방지용) ---------------- */

/**
 * 기간 안의 캘린더 일정. 우리가 만든 것(opsTaskId)은 빼고 돌려준다 —
 * 그건 이미 할일 블록으로 격자에 있다.
 */
export async function listBusy(timeMin: string, timeMax: string): Promise<BusyEvent[]> {
  if (!(await getConnection())) return [];
  const res = await googleFetch<{ items?: GEvent[] }>(base(), {
    query: {
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "100",
    },
  });
  const out: BusyEvent[] = [];
  for (const ev of res.items ?? []) {
    if (ev.status === "cancelled") continue;
    if (ev.extendedProperties?.private?.[TASK_PROP]) continue;
    const start = ev.start?.dateTime ?? ev.start?.date;
    const end = ev.end?.dateTime ?? ev.end?.date;
    if (!start || !end) continue;
    out.push({
      id: ev.id,
      title: ev.summary?.trim() || "(제목 없음)",
      start,
      end,
      allDay: !ev.start?.dateTime,
    });
  }
  return out;
}
