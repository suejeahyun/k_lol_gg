export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import { prisma } from "@/lib/prisma/client";
import { getSiteSettings } from "@/lib/site/settings";

export const metadata: Metadata = {
  title: "K-LOL MMR 플레이어",
  description: "K-LOL.GG 플레이어별 포지션 MMR과 분석 신뢰도를 확인하세요.",
};

function fmt(value: number | null | undefined, digits = 1) {
  return typeof value === "number" ? value.toFixed(digits) : "-";
}

export default async function UserAiMmrPlayersPage() {
  const siteSettings = await getSiteSettings();
  const profiles = await prisma.playerBalanceProfile.findMany({
    orderBy: [{ overallMmr: "desc" }, { matchesAnalyzed: "desc" }],
    take: 80,
    select: {
      id: true,
      overallMmr: true,
      topMmr: true,
      jungleMmr: true,
      midMmr: true,
      adcMmr: true,
      supportMmr: true,
      confidence: true,
      matchesAnalyzed: true,
      lastUpdatedAt: true,
      player: { select: { id: true, name: true, nickname: true, tag: true, currentTier: true, peakTier: true } },
    },
  });

  return (
    <PremiumFeatureGate feature="balanceAi" settings={siteSettings}>
    <main className="page-container ai-page ai-page--public">
      <section className="ai-hero">
        <div className="ai-hero__content">
          <p className="eyebrow">K-LOL MMR RANKING</p>
          <h1 className="page-title">K-LOL MMR 랭킹</h1>
        </div>
      </section>

      <section className="ai-panel" style={{ marginTop: 18 }}>
        <div className="ai-panel__head">
          <div>
            <h2 className="ai-panel__title">K-LOL MMR 랭킹</h2>
          </div>
        </div>
        <div className="ai-table-wrap">
          <table className="ai-table ai-table--wide">
            <thead>
              <tr>
                <th>순위</th>
                <th>플레이어</th>
                <th>전체</th>
                <th>TOP</th>
                <th>JGL</th>
                <th>MID</th>
                <th>ADC</th>
                <th>SUP</th>
                <th>신뢰도</th>
                <th>분석</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile, index) => (
                <tr key={profile.id}>
                  <td><span className="ai-rank">#{index + 1}</span></td>
                  <td>
                    <Link href={`/players/${profile.player.id}`}>{profile.player.name}</Link>
                    <br />
                    <small>{profile.player.nickname}#{profile.player.tag} · 현재 {profile.player.currentTier ?? "-"} · 최고 {profile.player.peakTier ?? "-"}</small>
                  </td>
                  <td><strong>{fmt(profile.overallMmr)}</strong></td>
                  <td>{fmt(profile.topMmr)}</td>
                  <td>{fmt(profile.jungleMmr)}</td>
                  <td>{fmt(profile.midMmr)}</td>
                  <td>{fmt(profile.adcMmr)}</td>
                  <td>{fmt(profile.supportMmr)}</td>
                  <td>{fmt(profile.confidence * 100)}%</td>
                  <td>{profile.matchesAnalyzed}경기</td>
                </tr>
              ))}
              {profiles.length === 0 && <tr><td colSpan={10}>AI MMR 프로필이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
    </PremiumFeatureGate>
  );
}
