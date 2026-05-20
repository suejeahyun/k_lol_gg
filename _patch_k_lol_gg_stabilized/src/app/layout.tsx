import "./globals.css";
import type { Metadata, Viewport } from "next";
import RandomBackgroundLayout from "../components/RandomBackgroundLayout";

const appName = "K-LOL.GG";
const appDescription = "K-LOL.GG 내전 전적, 랭킹, 팀 밸런스, 운영 도구";

export const metadata: Metadata = {
  applicationName: appName,
  title: {
    default: appName,
    template: `%s | ${appName}`,
  },
  description: appDescription,

  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05070d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="theme-lol-gold">
        <RandomBackgroundLayout>{children}</RandomBackgroundLayout>
      </body>
    </html>
  );
}
