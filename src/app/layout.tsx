import type { Metadata, Viewport } from "next";
import { Bagel_Fat_One } from "next/font/google";
import "./ui/framework7.css";
import "framework7-icons/css/framework7-icons.css";
import "./globals.css";
import "./ui/foundation.css";
import "./app-frame.css";
import "./auth-screen.css";
import "./chat-markdown.css";
import { FrameworkShell } from "./ui/FrameworkShell";
import SoundEffects from "./SoundEffects";

const display = Bagel_Fat_One({
  weight: "400",
  variable: "--font-bagel",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Here!",
  description: "무심한 듯 곁에 있는 고양이와, 글과 목소리로 나누는 이야기",
};

export const viewport: Viewport = {
  themeColor: "#F5F2EB",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`ios ${display.variable} h-full antialiased`}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col"><FrameworkShell>{children}<SoundEffects /></FrameworkShell></body>
    </html>
  );
}
