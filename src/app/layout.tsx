import "./globals.css";
import type { Metadata, Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import RandomBackgroundLayout from "../components/RandomBackgroundLayout";
import MobileAppGate from "@/components/MobileAppGate";
import SiteRuntimeSettings from "@/components/SiteRuntimeSettings";
import SiteAiAssistantLoader from "@/components/ai/SiteAiAssistantLoader";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { getPublicBaseUrl } from "@/lib/http/base-url";
import { createMobileAppBootScript } from "@/lib/navigation/mobile-app-route";

const appName = "K-LOL.GG";
const appDescription = "K-LOL.GG 내전 전적, 구인, 랭킹, 팀 밸런스, 운영 도구";
const themeBootScript = `
(() => {
  try {
    const allowed = ["bright-bloom", "lavender-dream", "mint-breeze"];
    const saved = window.localStorage.getItem("klol-theme");
    const theme = allowed.includes(saved || "") ? saved : "bright-bloom";
    document.documentElement.dataset.theme = theme || "bright-bloom";
    document.documentElement.style.colorScheme = "light";
    if (saved && !allowed.includes(saved)) {
      window.localStorage.setItem("klol-theme", "bright-bloom");
    }
  } catch (error) {
    document.documentElement.dataset.theme = "bright-bloom";
    document.documentElement.style.colorScheme = "light";
  }
})();
`;
const mobileAppBootScript = createMobileAppBootScript();

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
        url: "/images/theme/bloom/klol-bloom-hero-v1.webp",
        width: 1600,
        height: 900,
        alt: "구름 위에서 함께 경기를 준비하는 K-LOL.GG 오리지널 판타지 팀",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: appName,
    description: appDescription,
    images: ["/images/theme/bloom/klol-bloom-hero-v1.webp"],
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: appName,
    statusBarStyle: "default",
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
  themeColor: "#F7FBFF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://ddragon.leagueoflegends.com" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <script dangerouslySetInnerHTML={{ __html: mobileAppBootScript }} />
      </head>
      <body className="theme-bright-bloom">
        <SiteRuntimeSettings />
        <ServiceWorkerRegister />
        <RandomBackgroundLayout>
          {children}
          <SiteAiAssistantLoader />
          <MobileAppGate />
        </RandomBackgroundLayout>
        {process.env.VERCEL === "1" ? <SpeedInsights sampleRate={0.25} /> : null}
      </body>
    </html>
  );
}
