import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "K-LOL.GG V2",
    template: "%s | K-LOL.GG V2",
  },
  description: "함께 즐기는 리그 오브 레전드 내전 커뮤니티의 새로운 버전입니다.",
  openGraph: {
    title: "K-LOL.GG V2",
    description: "내전의 모든 순간을 더 쉽고 사랑스럽게.",
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "K-LOL.GG V2 아리 대표 이미지" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "K-LOL.GG V2",
    description: "내전의 모든 순간을 더 쉽고 사랑스럽게.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
