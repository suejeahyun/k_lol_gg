export const dynamic = "force-dynamic";

import type { CSSProperties } from "react";
import Link from "next/link";
import Pagination from "@/components/Pagination";
import { prisma } from "@/lib/prisma/client";

type Props = { searchParams: Promise<{ page?: string; q?: string; sort?: string }> };
const PAGE_SIZE = 20;
const SORT_FIELDS = new Set(["overallMmr", "topMmr", "jungleMmr", "midMmr", "adcMmr", "supportMmr", "confidence", "matchesAnalyzed"]);
const SORT_LABELS: Record<string, string> = {
  overallMmr: "전체 MMR",
  topMmr: "TOP MMR",
  jungleMmr: "JGL MMR",
  midMmr: "MID MMR",
  adcMmr: "ADC MMR",
  supportMmr: "SUP MMR",
  confidence: "신뢰도",
  matchesAnalyzed: "분석 경기",
};

function fmt(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(1) : "-";
}

export default async function AdminBalanceAiPlayersPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const q = sp.q?.trim() ?? "";
  const sort = SORT_FIELDS.has(sp.sort ?? "") ? sp.sort! : "overallMmr";
  const where = q
    ? {
        player: {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { nickname: { contains: q, mode: "insensitive" as const } },
            { tag: { contains: q, mode: "insensitive" as const } },
          ],
        },
      }
    : {};

  const [totalCount, profiles, avg] = await Promise.all([
    prisma.playerBalanceProfile.count({ where }),
    prisma.playerBalanceProfile.findMany({
      where,
      orderBy: { [sort]: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { player: true },
    }),
    prisma.playerBalanceProfile.aggregate({ _avg: { overallMmr: true, confidence: true, matchesAnalyzed: true } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <main className="page-container admin-page ai-page">
      <section className="ai-hero">
        <div className="ai-hero__content">
          <p className="eyebrow">AI MMR PLAYERS</p>
          <h1 className="page-title">AI MMR 플레이어 랭킹</h1>
          <p className="page-description">전체 및 라인별 내부 MMR, 데이터 신뢰도, 분석 경기 수를 확인합니다.</p>
        </div>
      </section>

      <section className="ai-kpi-grid">
        <article className="ai-kpi"><span>프로필</span><strong>{totalCount}</strong><small>검색 결과 기준</small></article>
        <article className="ai-kpi"><span>평균 MMR</span><strong>{fmt(avg._avg.overallMmr)}</strong><small>전체 평균</small></article>
        <article className="ai-kpi"><span>평균 신뢰도</span><strong>{avg._avg.confidence === null ? "-" : `${fmt(avg._avg.confidence * 100)}%`}</strong><small>데이터 신뢰도</small></article>
        <article className="ai-kpi"><span>평균 경기</span><strong>{fmt(avg._avg.matchesAnalyzed)}</strong><small>분석 경기 수</small></article>
        <article className="ai-kpi"><span>정렬</span><strong>{SORT_LABELS[sort]}</strong><small>현재 기준</small></article>
      </section>

      <section className="ai-panel">
        <form className="ai-toolbar">
          <input className="form-input" name="q" defaultValue={q} placeholder="플레이어 검색" />
          <select className="form-input" name="sort" defaultValue={sort}>
            {[...SORT_FIELDS].map((field) => <option key={field} value={field}>{SORT_LABELS[field] ?? field}</option>)}
          </select>
          <button className="button-primary">검색</button>
          <Link className="button-secondary" href="/admin/balance-ai/players">초기화</Link>
        </form>
        <div className="ai-table-wrap">
          <table className="ai-table">
            <thead>
              <tr><th>플레이어</th><th>전체</th><th>TOP</th><th>JGL</th><th>MID</th><th>ADC</th><th>SUP</th><th>신뢰도</th><th>경기</th><th>관리자</th><th></th></tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id}>
                  <td><span className="ai-player-name"><strong>{p.player.name}</strong><small>{p.player.nickname}#{p.player.tag}</small></span></td>
                  <td>{fmt(p.overallMmr)}</td>
                  <td>{fmt(p.topMmr)}</td>
                  <td>{fmt(p.jungleMmr)}</td>
                  <td>{fmt(p.midMmr)}</td>
                  <td>{fmt(p.adcMmr)}</td>
                  <td>{fmt(p.supportMmr)}</td>
                  <td><div>{fmt(p.confidence * 100)}%</div><div className="ai-meter" style={{ "--value": `${Math.min(100, Math.max(0, p.confidence * 100))}%` } as CSSProperties}><span /></div></td>
                  <td>{p.matchesAnalyzed}</td>
                  <td>{fmt(p.player.balanceOverrideScore)}</td>
                  <td><Link href={`/admin/players/${p.playerId}/balance`}>상세</Link></td>
                </tr>
              ))}
              {profiles.length === 0 && <tr><td colSpan={11}>MMR 프로필이 없습니다. 기존 내전을 재계산하면 생성됩니다.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/admin/balance-ai/players" query={{ sort, q }} />
      </section>
    </main>
  );
}
