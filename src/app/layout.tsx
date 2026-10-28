import { SERVICE_BRAND } from "@/lib/service-brand";
import type { Metadata, Viewport } from "next";
import { getSiteOrigin, SOCIAL_IMAGE } from "@/modules/seo/domain/site-seo";
import { PwaRegistration } from "@/components/pwa-registration";
import { SiteAiAssistant } from "@/components/site-ai-assistant";
import { VisualEffectsController } from "@/components/visual-effects-controller";
import "./globals.css";
import "./ux.css";
import "./image-theme.css";
import "./nexus-theme.css";
import "./hub-theme.css";

const isNexus = SERVICE_BRAND.id === "nexus";
const isHub = SERVICE_BRAND.id === "hub";
const iconPrefix = isNexus ? "/icons/nexus" : "/icons";
const tagline = isHub ? "독립된 커뮤니티, 하나의 운영 공간." : isNexus ? "함께하는 순간, 더 특별한 우리." : "내전의 모든 순간을 더 쉽고 사랑스럽게.";

export const viewport: Viewport = { themeColor: isHub ? "#123b3b" : isNexus ? "#080e1d" : "#89bdf2" };

export const metadata: Metadata = {
  metadataBase: getSiteOrigin(),
  title: {
    default: SERVICE_BRAND.name,
    template: `%s | ${SERVICE_BRAND.name}`,
  },
  description: isHub ? "독립된 커뮤니티 사이트를 둘러보고, 여러 사이트와 카카오톡 방을 한곳에서 관리하는 중앙 서비스입니다." : "함께 즐기는 리그 오브 레전드 내전 커뮤니티입니다.",
  manifest: "/manifest.webmanifest",
  applicationName: SERVICE_BRAND.name,
  appleWebApp: { capable: true, title: SERVICE_BRAND.name, statusBarStyle: "default" },
  icons: isHub ? { icon: [{ url: "/icons/hub/mark.svg", sizes: "any", type: "image/svg+xml" }] } : {
    icon: [
      { url: isNexus ? "/icons/nexus/mark.svg" : "/icons/klol-mark.svg", sizes: "any", type: "image/svg+xml" },
      { url: `${iconPrefix}/icon-192.png`, sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: `${iconPrefix}/icon-192.png`, sizes: "192x192", type: "image/png" }],
  },
  openGraph: {
    title: SERVICE_BRAND.name,
    description: tagline,
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SERVICE_BRAND.name,
    description: tagline,
    images: [SOCIAL_IMAGE.url],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" data-service={SERVICE_BRAND.id} className={`h-full antialiased${isNexus ? " dark" : ""}`}>
      <body className="min-h-full">{children}{!isHub ? <><VisualEffectsController /><PwaRegistration /><SiteAiAssistant /></> : null}</body>
    </html>
  );
}
