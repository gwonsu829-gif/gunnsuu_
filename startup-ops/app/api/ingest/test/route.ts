import { NextResponse } from "next/server";

import { todayISO } from "@/lib/dates";
import { ingestText } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 화면의 "메일 수신 테스트" 버튼이 부르는 곳.
 *
 * 메일 전달 서비스를 붙이기 전에 수집 → 추출 → 저장 → 대시보드 전체가
 * 이어지는지 확인하기 위한 것. 실제 웹훅과 똑같은 경로를 지난다.
 *
 * 비밀을 브라우저에 둘 수 없으므로 이 경로만 서버가 대신 넣어준다.
 * 대신 INGEST_SECRET이 설정돼 있을 때만 열리고, 분당 한 번으로 제한한다.
 */
export async function POST() {
  if (!(process.env.INGEST_SECRET ?? "").trim()) {
    return NextResponse.json(
      { error: "INGEST_SECRET이 설정되지 않아 수집이 꺼져 있습니다." },
      { status: 503 },
    );
  }

  const today = todayISO();
  const minute = new Date().toISOString().slice(0, 16);

  const result = await ingestText({
    text: [
      "보낸사람: 최지우 <jw.choi@daoncompany.co.kr>",
      "제목: [다온컴퍼니] 회의록 요약이 중간에 끊깁니다 - 확인 부탁드립니다",
      "",
      "안녕하세요, 다온컴퍼니 운영팀 최지우입니다.",
      "",
      "지난주 목요일부터 30분이 넘는 회의 녹음을 올리면 요약본이 절반쯤에서 끊긴 채로 생성됩니다.",
      "같은 파일로 세 번 재시도했지만 결과가 동일했고, 20분 내외 파일은 정상 동작합니다.",
      "",
      "오늘 중으로 조치 가능 여부와 예상 일정을 회신 부탁드립니다.",
      "",
      "감사합니다.",
      "최지우 드림",
    ].join("\n"),
    channel: "email",
    sourceLabel: `[테스트] 다온컴퍼니 오류 문의 (${today})`,
    // 버튼을 연타해도 할일이 불어나지 않게 분 단위로 묶는다.
    sourceRef: `test:${minute}`,
  });

  return NextResponse.json(result);
}
