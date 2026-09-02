import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "앰플랩 업무 대시보드",
  description:
    "메일·디스코드·캘린더에 흩어진 할일을 한곳에 모아 직무별로 분류하고, 세 사람이 겹치지 않게 나눠 처리합니다.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
