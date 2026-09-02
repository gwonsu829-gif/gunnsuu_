import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

/**
 * 주소의 ?tab= 과 구글 콜백 결과(?google=)를 읽어 화면에 넘긴다.
 * 콜백에서 돌아왔을 때 설정 화면이 바로 열리고 결과가 보여야 "됐나 안 됐나"를 안 헤맨다.
 */
export default function Page({
  searchParams,
}: {
  searchParams?: { tab?: string; google?: string; reason?: string };
}) {
  const google = searchParams?.google;
  const notice =
    google === "connected"
      ? "구글 계정이 연결됐습니다. 메일함에서 '지금 동기화'를 눌러 첫 분류를 시작하세요."
      : google === "denied"
        ? "구글 동의 화면에서 취소했습니다. 다시 시도하려면 '구글 계정 연결'을 누르세요."
        : google === "state"
          ? "연결 요청이 만료됐거나 다른 브라우저에서 시작됐습니다. 다시 눌러 주세요."
          : google === "failed"
            ? `구글 연결에 실패했습니다: ${searchParams?.reason ?? "원인 미상"}`
            : null;

  return <Dashboard initialTab={searchParams?.tab ?? null} googleNotice={notice} />;
}
