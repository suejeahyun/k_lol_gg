export const dynamic = "force-dynamic";

import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";

type Props = { params: Promise<{ playerId: string }> };

function fmt(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(1) : "-";
}

function deltaClass(value: number) {
  if (value > 0) return "ai-delta-positive";
  if (value < 0) return "ai-delta-negative";
  return "";
}

function strongestLine(profile: { topMmr: number; jungleMmr: number; midMmr: number; adcMmr: number; supportMmr: number } | null | undefined) {
  if (!profile) return "-";
  const rows = [
    ["TOP", profile.topMmr],
    ["JGL", profile.jungleMmr],
    ["MID", profile.midMmr],
    ["ADC", profile.adcMmr],
    ["SUP", profile.supportMmr],
  ] as const;
  return [...rows].sort((a, b) => b[1] - a[1])[0][0];
}

function weakestLine(profile: { topMmr: number; jungleMmr: number; midMmr: number; adcMmr: number; supportMmr: number } | null | undefined) {
  if (!profile) return "-";
  const rows = [
    ["TOP", profile.topMmr],
    ["JGL", profile.jungleMmr],
    ["MID", profile.midMmr],
    ["ADC", profile.adcMmr],
    ["SUP", profile.supportMmr],
  ] as const;
  return [...rows].sort((a, b) => a[1] - b[1])[0][0];
}

export default async function AdminPlayerBalancePage({ params }: Props) {
  const { playerId } = await params;
  const id = Number(playerId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const player = await prisma.player.findUnique({
    where: { id },
    include: {
      balanceProfile: true,
      balanceMatchResults: {
        orderBy: { createdAt: "desc" },
        take: 40,
        include: { matchSeries: { select: { id: true, title: true, matchDate: true } } },
      },
    },
  });
  if (!player) notFound();
  const p = player.balanceProfile;
  const lastTen = player.balanceMatchResults.slice(0, 10);
  const lastTenDelta = lastTen.reduce((sum, item) => sum + item.mmrDelta, 0);

  return (
    <main className="page-container admin-page ai-page">
      <section className="ai-hero">
        <div className="ai-hero__content">
          <p className="eyebrow">PLAYER AI MMR</p>
          <h1 className="page-title">{player.name} 밸런스 상세</h1>
          <p className="page-description">
            {player.nickname}#{player.tag} · 현재 {player.currentTier ?? "-"} · 최고 {player.peakTier ?? "-"}. 내부 AI MMR과 라인별 성향을 확인합니다.
          </p>
          <div className="ai-hero__actions">
            <Link className="button-secondary" href={`/admin/players/${player.id}/edit`}>플레이어 수정</Link>
            <Link className="button-secondary" href="/admin/balance-ai/players">MMR 랭킹</Link>
          </div>
        </div>
      </section>

      <section className="ai-kpi-grid">
        <article className="ai-kpi"><span>전체 MMR</span><strong>{fmt(p?.overallMmr)}</strong><small>AI 내부 점수</small></article>
        <article className="ai-kpi"><span>강한 라인</span><strong>{strongestLine(p)}</strong><small>라인별 MMR 기준</small></article>
        <article className="ai-kpi"><span>약한 라인</span><strong>{weakestLine(p)}</strong><small>배정 주의</small></article>
        <article className="ai-kpi"><span>신뢰도</span><strong>{p ? `${fmt(p.confidence * 100)}%` : "-"}</strong><small>{p?.matchesAnalyzed ?? 0}경기 분석</small></article>
        <article className="ai-kpi"><span>최근 10경기</span><strong className={deltaClass(lastTenDelta)}>{fmt(lastTenDelta)}</strong><small>MMR 변화 합</small></article>
      </section>

      <section className="ai-grid-2">
        <article className="ai-panel ai-panel--strong">
          <div className="ai-panel__head">
            <div>
              <h2 className="ai-panel__title">라인별 MMR</h2>
              <p className="ai-panel__desc">팀 밸런스 계산 시 실제 배정 포지션의 MMR 보정에 사용됩니다.</p>
            </div>
          </div>
          <div className="ai-table-wrap">
            <table className="ai-table">
              <thead><tr><th>라인</th><th>MMR</th><th>기준</th></tr></thead>
              <tbody>
                {[
                  ["TOP", p?.topMmr],
                  ["JGL", p?.jungleMmr],
                  ["MID", p?.midMmr],
                  ["ADC", p?.adcMmr],
                  ["SUP", p?.supportMmr],
                ].map(([line, value]) => (
                  <tr key={String(line)}><td>{line}</td><td>{fmt(value as number | undefined)}</td><td><div className="ai-meter" style={{ "--value": `${Math.min(100, Math.max(0, Number(value ?? 0)))}%` } as CSSProperties}><span /></div></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className={player.balanceOverrideScore ? "ai-panel ai-warning" : "ai-panel"}>
          <div className="ai-panel__head">
            <div>
              <h2 className="ai-panel__title">관리자 수동 보정</h2>
              <p className="ai-panel__desc">AI가 알 수 없는 컨디션, 휴면, 체감 실력을 반영하는 값입니다.</p>
            </div>
            <span className="ai-badge">{fmt(player.balanceOverrideScore)}</span>
          </div>
          {player.balanceOverrideReason ? <p className="ai-muted">{player.balanceOverrideReason}</p> : <div className="ai-empty">등록된 보정 사유가 없습니다.</div>}
        </article>
      </section>

      <section className="ai-panel">
        <div className="ai-panel__head">
          <div>
            <h2 className="ai-panel__title">최근 MMR 변화</h2>
            <p className="ai-panel__desc">내전 등록 후 자동 반영된 개인/라인 MMR 변화입니다.</p>
          </div>
        </div>
        <div className="ai-table-wrap">
          <table className="ai-table">
            <thead><tr><th>내전</th><th>팀</th><th>라인</th><th>K/D/A</th><th>승</th><th>MMR</th><th>라인 MMR</th></tr></thead>
            <tbody>
              {player.balanceMatchResults.map((item) => (
                <tr key={item.id}>
                  <td><Link href={`/admin/matches/${item.matchSeriesId}/ai-review`}>{item.matchSeries.title}</Link></td>
                  <td><span className={item.team === "RED" ? "ai-badge ai-badge--red" : "ai-badge ai-badge--blue"}>{item.team}</span></td>
                  <td>{item.position}</td>
                  <td>{item.kills}/{item.deaths}/{item.assists}</td>
                  <td>{item.win ? "승" : "패"}</td>
                  <td className={deltaClass(item.mmrDelta)}>{fmt(item.mmrDelta)}</td>
                  <td className={deltaClass(item.positionMmrDelta)}>{fmt(item.positionMmrDelta)}</td>
                </tr>
              ))}
              {player.balanceMatchResults.length === 0 && <tr><td colSpan={7}>MMR 변화 기록이 없습니다. 내전 등록 또는 전체 재계산 후 생성됩니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
