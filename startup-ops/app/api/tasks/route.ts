import { NextResponse } from "next/server";

import { readChannelConfig, readBotToken } from "@/lib/discord";
import { readApiKey } from "@/lib/extract";
import { TaskPatch, getStore } from "@/lib/store";
import { PRIORITIES, ROLES, STATUSES } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 대시보드가 자동 수집분을 읽어가는 곳. */
export async function GET() {
  const store = getStore();
  const tasks = await store.listTasks();

  return NextResponse.json({
    tasks: tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    // 화면에 "지금 무엇이 켜져 있는지" 그대로 드러낸다.
    연동: {
      저장소: store.kind,
      메일: Boolean((process.env.INGEST_SECRET ?? "").trim()),
      디스코드: Boolean(readBotToken()) && readChannelConfig().length > 0,
      디스코드_채널: readChannelConfig().map((c) => c.label),
      AI: Boolean(readApiKey()),
    },
  });
}

/** 담당자·우선순위·직무·상태를 사람이 덮어쓸 때. */
export async function PATCH(request: Request) {
  let body: { id?: string; patch?: TaskPatch };
  try {
    body = (await request.json()) as { id?: string; patch?: TaskPatch };
  } catch {
    return NextResponse.json({ error: "본문을 읽을 수 없습니다." }, { status: 400 });
  }

  const { id, patch } = body;
  if (!id || !patch) {
    return NextResponse.json({ error: "id와 patch가 필요합니다." }, { status: 400 });
  }

  // 화면에서 온 값이라도 그대로 믿지 않는다.
  const clean: TaskPatch = {};
  if (patch.role && (ROLES as readonly string[]).includes(patch.role)) clean.role = patch.role;
  if (patch.status && (STATUSES as readonly string[]).includes(patch.status)) clean.status = patch.status;
  if (patch.priority && (PRIORITIES as readonly string[]).includes(patch.priority)) clean.priority = patch.priority;
  if (typeof patch.assignee === "string" && patch.assignee.trim()) {
    clean.assignee = patch.assignee.trim().slice(0, 40);
  }

  if (!Object.keys(clean).length) {
    return NextResponse.json({ error: "바꿀 수 있는 값이 없습니다." }, { status: 400 });
  }

  const updated = await getStore().updateTask(id, clean);
  if (!updated) {
    return NextResponse.json({ error: "해당 할일을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ task: updated });
}

export async function DELETE() {
  await getStore().clearTasks();
  return NextResponse.json({ ok: true });
}
