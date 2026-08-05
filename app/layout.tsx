import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "拾光笔记 · 读后感与观后感",
  description: "记录书籍与影像带来的触动，用思维导图梳理每一次思考。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
