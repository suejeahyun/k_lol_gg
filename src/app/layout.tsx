import type { Metadata } from "next";
import { PwaRegistration } from "@/components/pwa-registration";
import { SiteAiAssistant } from "@/components/site-ai-assistant";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "K-LOL.GG",
    template: "%s | K-LOL.GG",
  },
  description: "함께 즐기는 리그 오브 레전드 내전 커뮤니티입니다.",
  manifest: "/manifest.webmanifest",
  applicationName: "K-LOL.GG",
  appleWebApp: { capable: true, title: "K-LOL.GG", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  openGraph: {
    title: "K-LOL.GG",
    description: "내전의 모든 순간을 더 쉽고 사랑스럽게.",
    images: [{
      url: "/og.png",
      width: 1200,
      height: 630,
      alt: "파스텔 하늘에서 여우불을 띄운 아리 비공식 AI 팬아트",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "K-LOL.GG",
    description: "내전의 모든 순간을 더 쉽고 사랑스럽게.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}<PwaRegistration /><SiteAiAssistant /></body>
    </html>
  );
}
