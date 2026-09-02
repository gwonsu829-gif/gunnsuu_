import { NextResponse } from "next/server";

import { recordAudit, whoFrom } from "@/lib/audit";
import { googleStatus } from "@/lib/google";
import { lastSyncAt, relabelMail } from "@/lib/mail";
import { getStore } from "@/lib/store";
import { MailLabel } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 메일함 화면이 읽어가는 곳. 최근 것이 먼저. */
export async function GET() {
  const store = getStore();
  const [mails, google, last] = await Promise.all([
    store.listMails(),
    googleStatus(),
    lastSyncAt(),
  ]);
  return NextResponse.json({
    mails: mails.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
    google,
    lastSyncAt: last,
  });
}

/** 사람이 라벨을 고친다. */
export async function PATCH(request: Request) {
  let body: { id?: string; labels?: MailLabel[] };
  try {
    body = (await request.json()) as { id?: string; labels?: MailLabel[] };
  } catch {
    return NextResponse.json({ error: "본문을 읽을 수 없습니다." }, { status: 400 });
  }
  if (!body.id || !Array.isArray(body.labels)) {
    return NextResponse.json({ error: "id와 labels가 필요합니다." }, { status: 400 });
  }
  const result = await relabelMail(body.id, body.labels);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });

  await recordAudit({
    who: whoFrom(request),
    action: "메일라벨수정",
    targetId: body.id,
    summary: `메일 라벨 수정 → ${result.mail.labels.join(", ")} · ${result.mail.subject}`,
  });
  return NextResponse.json({ mail: result.mail });
}
