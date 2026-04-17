import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "K-LOL.GG",
  description: "K-LOL.GG",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}