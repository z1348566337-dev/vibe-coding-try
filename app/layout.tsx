import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "杰森笔记 · 读后感与观后感",
  description: "记录书籍与影像带来的触动，用思维导图梳理每一次思考。",
  applicationName: "杰森笔记",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "杰森笔记",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1f2d40",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body>{children}</body>
    </html>
  );
}
