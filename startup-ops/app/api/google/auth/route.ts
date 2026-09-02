import { NextResponse } from "next/server";

import { GoogleError, buildAuthUrl } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 설정 화면의 "구글 계정 연결" 버튼이 오는 곳. 구글 동의 화면으로 보낸다. */
export async function GET(request: Request) {
  try {
    const state = Math.random().toString(36).slice(2);
    const res = NextResponse.redirect(buildAuthUrl(request.url, state));
    // 되돌아올 때 같은 state인지 본다. 남이 만든 콜백 주소를 눌러 계정이 바뀌는 걸 막는다.
    res.cookies.set("google_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: Boolean(process.env.VERCEL),
      path: "/",
      maxAge: 600,
    });
    return res;
  } catch (e) {
    const message = e instanceof GoogleError ? e.message : "구글 연결을 시작하지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
