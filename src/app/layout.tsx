import "./globals.css";
import type { Metadata, Viewport } from "next";
import RandomBackgroundLayout from "../components/RandomBackgroundLayout";
import MobileAppGate from "@/components/MobileAppGate";

const appName = "K-LOL.GG";
const appDescription = "K-LOL.GG 내전 전적, 구인, 랭킹, 팀 밸런스, 운영 도구";
const themeBootScript = `
(() => {
  try {
    const allowed = ["dark-modern", "neon-cyber", "black-gold"];
    const saved = window.localStorage.getItem("klol-theme");
    const theme = allowed.includes(saved || "") ? saved : "dark-modern";
    document.documentElement.dataset.theme = theme || "dark-modern";
    document.documentElement.style.colorScheme = "dark";
    if (saved && !allowed.includes(saved)) {
      window.localStorage.setItem("klol-theme", "dark-modern");
    }
  } catch (error) {
    document.documentElement.dataset.theme = "dark-modern";
    document.documentElement.style.colorScheme = "dark";
  }
})();
`;
const mobileAppBootScript = `
(() => {
  try {
    const path = window.location.pathname || "/";
    if (path.startsWith("/app")) return;
    if (!window.matchMedia("(max-width: 820px)").matches) return;
    if (window.sessionStorage.getItem("klol-mobile-pc-view") === "1") return;

    const toAppPath = (pathname) => {
      if (pathname === "/" || pathname === "") return "/app";
      if (pathname.startsWith("/admin")) return "/app/admin";
      if (pathname.startsWith("/players/")) return pathname.replace("/players", "/app/players");
      if (pathname === "/players") return "/app/players";
      if (pathname.startsWith("/matches/")) return pathname.replace("/matches", "/app/matches");
      if (pathname === "/matches") return "/app/matches";
      if (pathname === "/rankings") return "/app/rankings";
      if (pathname === "/recruit") return "/app/recruits";
      if (pathname.startsWith("/account") || pathname.startsWith("/me")) return "/app/me";
      return "/app";
    };

    window.location.replace(toAppPath(path) + window.location.search);
  } catch {
    if (!window.location.pathname.startsWith("/app")) {
      window.location.replace("/app");
    }
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
        <script dangerouslySetInnerHTML={{ __html: mobileAppBootScript }} />
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
