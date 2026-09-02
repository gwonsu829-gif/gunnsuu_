import { NextResponse } from "next/server";

import { AUTH_COOKIE, AUTH_MAX_AGE, authEnabled, cookieValueFor, readPasscode } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 코드 대조. 틀리면 잠깐 기다리게 해서 무차별 대입을 느리게 한다. */
export async function POST(request: Request) {
  if (!authEnabled()) return NextResponse.json({ ok: true, open: true });

  let body: { passcode?: string };
  try {
    body = (await request.json()) as { passcode?: string };
  } catch {
    return NextResponse.json({ error: "본문을 읽을 수 없습니다." }, { status: 400 });
  }
  const given = (body.passcode ?? "").trim();
  const expected = readPasscode();

  let diff = given.length === expected.length ? 0 : 1;
  for (let i = 0; i < Math.min(given.length, expected.length); i += 1) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) {
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "접근코드가 맞지 않습니다." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await cookieValueFor(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(process.env.VERCEL),
    path: "/",
    maxAge: AUTH_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
