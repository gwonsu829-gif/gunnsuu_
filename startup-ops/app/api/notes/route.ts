import { NextResponse } from "next/server";

import { NOTES_MAX, getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  return NextResponse.json({ notes: await store.getNotes(), 저장소: store.kind });
}

/**
 * 메모 저장.
 *
 * 통째로 덮어쓴다. 메모는 한 사람이 한 화면에서 쓰는 쪽지라
 * 조각을 합치는 규칙을 두면 얻는 것 없이 어긋날 자리만 는다.
 * (여러 명이 동시에 쓰기 시작하면 그때 다시 볼 것 — 지금은 3인 단일 보드 전제)
 */
export async function PUT(request: Request) {
  let body: { notes?: unknown };
  try {
    body = (await request.json()) as { notes?: unknown };
  } catch {
    return NextResponse.json({ error: "본문을 읽을 수 없습니다." }, { status: 400 });
  }

  if (typeof body.notes !== "string") {
    return NextResponse.json({ error: "notes는 문자열이어야 합니다." }, { status: 400 });
  }

  // 길이는 자르되 거부하지는 않는다. 쓰던 메모가 통째로 날아가는 게 더 나쁘다.
  const notes = body.notes.slice(0, NOTES_MAX);
  await getStore().setNotes(notes);
  return NextResponse.json({ ok: true, notes });
}
