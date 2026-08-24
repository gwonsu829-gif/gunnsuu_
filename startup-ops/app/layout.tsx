import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "업무 자동 분류 대시보드",
  description:
    "이메일과 디스코드에 흩어진 할일을 자동으로 추출해 직무별로 분류·우선순위화합니다.",
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
