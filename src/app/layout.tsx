import type { Metadata, Viewport } from "next";
import { Bagel_Fat_One } from "next/font/google";
import "./globals.css";

const display = Bagel_Fat_One({
  weight: "400",
  variable: "--font-bagel",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Here!",
  description: "말로 이야기하고, 필요할 때 가까운 병원으로",
};

export const viewport: Viewport = {
  themeColor: "#AFC1FF",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${display.variable} h-full antialiased`}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
