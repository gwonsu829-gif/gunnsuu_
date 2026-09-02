import { NextResponse } from "next/server";

import { recordAudit, whoFrom } from "@/lib/audit";
import { calendarConnected, pushSlot, removeEvent } from "@/lib/calendar";
import { readBotToken } from "@/lib/discord";
import { pickProvider } from "@/lib/extract";
import { googleStatus } from "@/lib/google";
import { readSlot } from "@/lib/slot";
import { TaskPatch, getStore } from "@/lib/store";
import { AuditAction, PRIORITIES, ROLES, STATUSES, StageAt } from "@/lib/types";
import { UNASSIGNED } from "@/lib/team";
import { readUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** 대시보드가 자동 수집분을 읽어가는 곳. */
export async function GET() {
  const store = getStore();
  const [tasks, settings, google] = await Promise.all([
    store.listTasks(),
    store.getSettings(),
    googleStatus(),
  ]);
  const usage = await readUsage();

  return NextResponse.json({
    tasks: tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    settings,
    // 화면에 "지금 무엇이 켜져 있는지" 그대로 드러낸다.
    연동: {
      저장소: store.kind,
      메일: Boolean((process.env.INGEST_SECRET ?? "").trim()),
      /*
       * 채널 목록은 여기서 조회하지 않는다. 이 경로는 30초마다 불리는데
       * 그때마다 디스코드 API를 때리면 목록 조회만으로 하루 2천 번이 넘는다.
       * 화면에 필요한 건 "봇이 있느냐"뿐이고, 실제 채널은 설정 화면에서 부른다.
       */
      디스코드: Boolean(readBotToken()),
      디스코드_모드: settings.discord.mode,
      디스코드_콕집기: settings.discord.pinEmoji || null,
      AI: pickProvider() !== null,
      AI_제공자: pickProvider(),
      구글: google.connected,
      구글_계정: google.email ?? null,
      구글_설정됨: google.configured,
      AI_오늘: usage.calls,
      AI_상한: settings.aiDailyLimit,
    },
  });
}

interface PatchBody {
  id?: string;
  patch?: TaskPatch;
  /** 화면이 마지막으로 본 판. 보내지 않으면 검사하지 않는다 (옛 화면 호환). */
  expectedVersion?: number;
}

/** 담당자·우선순위·직무·상태·시간을 사람이 덮어쓸 때. */
export async function PATCH(request: Request) {
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "본문을 읽을 수 없습니다." }, { status: 400 });
  }

  const { id, patch } = body;
  if (!id || !patch) {
    return NextResponse.json({ error: "id와 patch가 필요합니다." }, { status: 400 });
  }
  const who = whoFrom(request);

  // 화면에서 온 값이라도 그대로 믿지 않는다.
  const clean: TaskPatch = {};
  if (patch.role && (ROLES as readonly string[]).includes(patch.role)) clean.role = patch.role;
  if (patch.status && (STATUSES as readonly string[]).includes(patch.status)) clean.status = patch.status;
  if (patch.priority && (PRIORITIES as readonly string[]).includes(patch.priority)) clean.priority = patch.priority;
  if (typeof patch.assignee === "string" && patch.assignee.trim()) {
    clean.assignee = patch.assignee.trim().slice(0, 40);
  }
  /*
   * 잡아둔 시간. null은 "해제"라는 뜻이라 그대로 통과시킨다.
   * 값이 왔는데 말이 안 되면 400으로 막지 않고 이 필드만 버린다 —
   * 시간 하나 때문에 같이 온 담당자·상태 변경까지 되돌릴 이유가 없다.
   */
  if (patch.slot === null) {
    clean.slot = null;
  } else if (patch.slot) {
    const s = readSlot(patch.slot);
    if (s) clean.slot = s;
  }
  // 중복 처리. 다른 할일 id를 가리키거나(합침) null(중복 아님)이다.
  if (patch.duplicateOf === null) clean.duplicateOf = null;
  else if (typeof patch.duplicateOf === "string" && patch.duplicateOf && patch.duplicateOf !== id) {
    clean.duplicateOf = patch.duplicateOf.slice(0, 60);
  }

  /*
   * 단계 시각은 화면이 아니라 서버가 찍는다.
   * 브라우저 시계는 틀어져 있을 수 있고, 값을 그대로 받으면 조작도 가능하다.
   */
  const now = new Date().toISOString();
  const stageAt: StageAt = {};
  if (clean.assignee && clean.assignee !== UNASSIGNED) stageAt.assigned = now;
  if (clean.status === "진행중") stageAt.started = now;
  if (clean.status === "완료") stageAt.done = now;
  if (Object.keys(stageAt).length) clean.stageAt = stageAt;

  if (!Object.keys(clean).length) {
    return NextResponse.json({ error: "바꿀 수 있는 값이 없습니다." }, { status: 400 });
  }

  const store = getStore();
  const before = await store.getTask(id);
  const result = await store.updateTask(id, clean, {
    expectedVersion: typeof body.expectedVersion === "number" ? body.expectedVersion : undefined,
    by: who || undefined,
  });

  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "해당 할일을 찾을 수 없습니다." }, { status: 404 });
    }
    /*
     * 다른 사람이 먼저 저장했다. 덮어쓰지 않고 지금 값을 돌려준다.
     * 화면은 이 값으로 갈아끼우고 "OO님이 방금 바꿨습니다"를 보여준다.
     */
    return NextResponse.json(
      {
        error: `${result.current.updatedBy ?? "다른 사람"}이(가) 방금 이 할일을 바꿨습니다. 최신 값을 불러왔습니다.`,
        conflict: true,
        task: result.current,
      },
      { status: 409 },
    );
  }

  let updated = result.task;

  /* ---------- 캘린더 반영 ---------- */
  let calendar: string | undefined;
  if (clean.slot !== undefined && (await calendarConnected())) {
    try {
      if (clean.slot === null) {
        if (updated.calendarEventId) {
          await removeEvent(updated.calendarEventId);
          const r = await store.updateTask(id, { calendarEventId: null }, { by: "구글 캘린더" });
          if (r.ok) updated = r.task;
        }
        calendar = "removed";
      } else {
        const eventId = await pushSlot(updated, clean.slot);
        if (eventId !== updated.calendarEventId) {
          const r = await store.updateTask(id, { calendarEventId: eventId }, { by: "구글 캘린더" });
          if (r.ok) updated = r.task;
        }
        calendar = "synced";
      }
    } catch (e) {
      // 캘린더가 잠깐 안 되어도 대시보드 값은 이미 저장됐다. 화면에 사유만 알린다.
      calendar = `failed: ${e instanceof Error ? e.message : "알 수 없는 오류"}`;
      console.error("[calendar] 반영 실패:", calendar);
    }
  } else if (clean.slot !== undefined) {
    calendar = "not-connected";
  }

  /* ---------- 이력 ---------- */
  const title = updated.title.slice(0, 40);
  const logs: { action: AuditAction; summary: string }[] = [];
  if (clean.assignee && clean.assignee !== before?.assignee)
    logs.push({ action: "담당변경", summary: `담당 ${before?.assignee ?? "?"} → ${clean.assignee} · ${title}` });
  if (clean.status && clean.status !== before?.status)
    logs.push({ action: "상태변경", summary: `${clean.status} · ${title}` });
  if (clean.priority && clean.priority !== before?.priority)
    logs.push({ action: "우선순위변경", summary: `우선순위 ${clean.priority} · ${title}` });
  if (clean.role && clean.role !== before?.role)
    logs.push({ action: "직무변경", summary: `직무 ${before?.role ?? "?"} → ${clean.role} · ${title}` });
  if (clean.slot === null) logs.push({ action: "시간비움", summary: `시간 비움 · ${title}` });
  else if (clean.slot) logs.push({ action: "시간잡음", summary: `시간 잡음 ${clean.slot.start.slice(0, 16)} · ${title}` });
  if (clean.duplicateOf !== undefined)
    logs.push({
      action: "중복처리",
      summary: clean.duplicateOf ? `중복으로 묶음 · ${title}` : `중복 아님으로 되돌림 · ${title}`,
    });
  for (const l of logs) await recordAudit({ who, action: l.action, targetId: id, summary: l.summary });

  return NextResponse.json({ task: updated, calendar });
}

export async function DELETE() {
  await getStore().clearTasks();
  return NextResponse.json({ ok: true });
}
