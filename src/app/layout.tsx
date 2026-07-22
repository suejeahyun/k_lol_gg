import "./globals.css";
import type { Metadata, Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import RandomBackgroundLayout from "../components/RandomBackgroundLayout";
import MobileAppGate from "@/components/MobileAppGate";
import SiteRuntimeSettings from "@/components/SiteRuntimeSettings";
import SiteAiAssistant from "@/components/ai/SiteAiAssistant";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { getPublicBaseUrl } from "@/lib/http/base-url";

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
    if (
      path === "/install" ||
      path.startsWith("/install/") ||
      path === "/signup" ||
      path === "/forgot-password" ||
      path === "/privacy" ||
      path === "/terms"
    ) return;
    if (!window.matchMedia("(max-width: 820px)").matches) return;
    if (window.sessionStorage.getItem("klol-mobile-pc-view") === "1") return;

    const appendSearch = (target, search) => {
      if (!search) return target;
      return target.includes("?") ? target + "&" + search : target + "?" + search;
    };

    const detailTarget = (pathname, sourcePrefix, appPrefix) => {
      const match = pathname.slice(sourcePrefix.length).match(/^\\/(\\d+)/);
      return match ? appPrefix + "/" + match[1] : appPrefix;
    };

    const toAppPath = (pathname, search) => {
      let target = "/app";
      if (pathname === "/" || pathname === "") target = "/app";
      else if (pathname.startsWith("/admin")) target = "/app/admin";
      else if (
        pathname.startsWith("/players/balance") ||
        pathname.startsWith("/balance")
      ) target = "/app";
      else if (pathname.startsWith("/random-team")) target = "/app/random-team";
      else if (pathname.startsWith("/players/")) target = detailTarget(pathname, "/players", "/app/players");
      else if (pathname === "/players") target = "/app/players";
      else if (pathname.startsWith("/matches/")) target = detailTarget(pathname, "/matches", "/app/matches");
      else if (pathname === "/matches") target = "/app/matches";
      else if (pathname === "/rankings" || pathname.startsWith("/ai-balance")) target = "/app/rankings";
      else if (
        pathname.startsWith("/recruit") ||
        pathname.startsWith("/kakao") ||
        pathname.startsWith("/recruit-helper")
      ) target = "/app/recruits";
      else if (pathname.startsWith("/progress") || pathname.startsWith("/participation")) target = "/app/matches?tab=events";
      else if (pathname.startsWith("/riot-api")) target = "/app/me";
      else if (pathname.startsWith("/account") || pathname.startsWith("/me")) target = "/app/me";
      else if (pathname.startsWith("/login") || pathname.startsWith("/signup")) target = "/app/login";
      return appendSearch(target, search);
    };

    window.location.replace(toAppPath(path, window.location.search.slice(1)));
  } catch {
    if (!window.location.pathname.startsWith("/app")) {
      window.location.replace("/app");
    }
  }
})();
`;

export const metadata: Metadata = {
  metadataBase: new URL(getPublicBaseUrl()),
  applicationName: appName,
  title: {
    default: appName,
    template: `%s | ${appName}`,
  },
  description: appDescription,
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: appName,
    title: appName,
    description: appDescription,
    images: [
      {
        url: "/images/theme/dark-modern/home-hero-structured-v1.png",
        width: 1915,
        height: 821,
        alt: "K-LOL.GG 내전 기록과 시즌 랭킹",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: appName,
    description: appDescription,
    images: ["/images/theme/dark-modern/home-hero-structured-v1.png"],
  },
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
        <SiteRuntimeSettings />
        <ServiceWorkerRegister />
        <RandomBackgroundLayout>
          {children}
          <SiteAiAssistant />
          <MobileAppGate />
        </RandomBackgroundLayout>
        {process.env.VERCEL === "1" ? <SpeedInsights sampleRate={0.25} /> : null}
      </body>
    </html>
  );
}
