import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "플레이어 목록",
  description: "K-LOL.GG 플레이어 전적, 승률, MVP, 티어와 주 포지션을 확인하세요.",
  alternates: { canonical: "/players" },
};

export * from "./page.impl";
export { default } from "./page.impl";
