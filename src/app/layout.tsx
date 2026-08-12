import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Razer-Raders",
  description: "为 AI Builder 提供可追溯的每日 AI 信号简报。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
