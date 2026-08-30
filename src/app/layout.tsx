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
        <link rel="preconnect" href="https://ddragon.leagueoflegends.com" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <script dangerouslySetInnerHTML={{ __html: mobileAppBootScript }} />
      </head>
      <body className="theme-lol-gold">
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
