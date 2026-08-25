import { NextResponse } from "next/server";

import { ingestText } from "@/lib/ingest";
import { checkIngestAuth } from "@/lib/webhook-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface NormalizedMail {
  subject: string;
  from: string;
  body: string;
  messageId?: string;
  receivedAt?: string;
}

function pick(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/**
 * 메일 전달 서비스마다 필드 이름이 제각각이라 흔한 이름들을 모두 받아준다.
 * (SendGrid: subject/from/text, Postmark: Subject/From/TextBody, Cloudflare: 직접 구성)
 */
function normalize(payload: Record<string, unknown>): NormalizedMail {
  return {
    subject: pick(payload, ["subject", "Subject", "headers.subject"]),
    from: pick(payload, ["from", "From", "sender", "envelope_from"]),
    body: pick(payload, [
      "text",
      "TextBody",
      "body",
      "plain",
      "text_body",
      "stripped-text",
    ]),
    messageId: pick(payload, ["messageId", "MessageID", "Message-Id", "message_id", "id"]) || undefined,
    receivedAt: pick(payload, ["receivedAt", "Date", "date"]) || undefined,
  };
}

async function readPayload(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    return (await request.json()) as Record<string, unknown>;
  }
  // 상당수의 인바운드 메일 서비스가 form-data로 보낸다.
  const form = await request.formData();
  const out: Record<string, unknown> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") out[key] = value;
  });
  return out;
}

export async function POST(request: Request) {
  const auth = checkIngestAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await readPayload(request);
  } catch {
    return NextResponse.json({ error: "본문을 읽을 수 없습니다." }, { status: 400 });
  }

  const mail = normalize(payload);
  if (!mail.body && !mail.subject) {
    return NextResponse.json(
      { error: "제목과 본문이 모두 비어 있습니다." },
      { status: 400 },
    );
  }

  // 제목도 판단 근거가 되므로 본문과 함께 넘긴다.
  const text = [
    mail.from ? `보낸사람: ${mail.from}` : "",
    mail.subject ? `제목: ${mail.subject}` : "",
    "",
    mail.body,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await ingestText({
    text,
    channel: "email",
    sourceLabel: mail.subject || "제목 없는 메일",
    sourceRef: mail.messageId,
    receivedAt: parseDate(mail.receivedAt),
  });

  return NextResponse.json(result);
}

function parseDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}
