import "./globals.css";
import type { Metadata, Viewport } from "next";
import RandomBackgroundLayout from "../components/RandomBackgroundLayout";
import MobileAppGate from "@/components/MobileAppGate";

const appName = "K-LOL.GG";
const appDescription = "K-LOL.GG 내전 전적, 구인, 랭킹, 팀 밸런스, 운영 도구";
const themeBootScript = `
(() => {
  try {
    const allowed = ["dark-modern", "neon-cyber", "black-gold", "clean-light"];
    const saved = window.localStorage.getItem("klol-theme");
    const theme = allowed.includes(saved || "") ? saved : "dark-modern";
    document.documentElement.dataset.theme = theme || "dark-modern";
    document.documentElement.style.colorScheme = theme === "clean-light" ? "light" : "dark";
  } catch (error) {
    document.documentElement.dataset.theme = "dark-modern";
  }
})();
`;

export const metadata: Metadata = {
  applicationName: appName,
  title: {
    default: appName,
    template: `%s | ${appName}`,
  },
  description: appDescription,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: appName,
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#05070d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="theme-lol-gold">
        <RandomBackgroundLayout>
          {children}
          <MobileAppGate />
        </RandomBackgroundLayout>
      </body>
    </html>
  );
}
