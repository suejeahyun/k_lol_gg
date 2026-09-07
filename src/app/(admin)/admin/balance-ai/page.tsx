import Link from "next/link";
import { Activity, BrainCircuit, Database, History } from "lucide-react";

import { isMmrUuid, parseMmrPlayerQuery } from "@/modules/mmr";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeMmr } from "@/modules/mmr/infrastructure/runtime-mmr";

import { MmrAdminActions } from "./mmr-admin-actions";
import styles from "./mmr-admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminBalanceAiPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageRole("ADMIN", "/admin/balance-ai");
  const raw = await searchParams;
  const tab = raw.tab === "reviews" ? "reviews" : raw.tab === "players" ? "players" : "summary";
  const selectedReviewId = typeof raw.review === "string" && isMmrUuid(raw.review)
    ? raw.review.toLocaleLowerCase("en-US")
    : null;
  const url = new URL("https://v2.invalid/admin/balance-ai");
  for (const key of ["q", "position", "page", "pageSize"] as const) {
    const value = raw[key];
    if (typeof value === "string") url.searchParams.set(key, value);
  }
  const query = parseMmrPlayerQuery(url.href) ?? { query: "", position: null, page: 1, pageSize: 20 };
  const result = await loadRuntimeMmr(async (service) => ({
    summary: await service.getSummary(),
    players: tab === "reviews" ? null : await service.listPlayers(query),
    reviews: tab === "reviews" ? await service.listAdjustments(query.page, query.pageSize) : null,
  }));

  return (
    <main className={styles.page}>
      <header className={styles.hero}><div><span><BrainCircuit aria-hidden="true" /> S05-B MMR</span><h1>MMR projection 작업대</h1><p>PUBLISHED 경기와 수동 조정 원장을 정해진 순서로 전부 재생합니다.</p></div><Database aria-hidden="true" /></header>
      <nav className={styles.tabs} aria-label="MMR 관리자 탭"><Link href="/admin/balance-ai" aria-current={tab === "summary" ? "page" : undefined}>요약</Link><Link href="/admin/balance-ai?tab=players" aria-current={tab === "players" ? "page" : undefined}>플레이어</Link><Link href="/admin/balance-ai?tab=reviews" aria-current={tab === "reviews" ? "page" : undefined}>조정 이력</Link></nav>
      {result.state === "ready" ? <>
        <section className={styles.summary}><article><span>generation</span><strong>{result.data.summary.generation}</strong></article><article><span>경기 / 게임</span><strong>{result.data.summary.sourceMatchCount} / {result.data.summary.sourceGameCount}</strong></article><article><span>독립 반영 대기</span><strong>{result.data.summary.pendingSourceCount}</strong></article><article><span>수동 조정</span><strong>{result.data.summary.sourceAdjustmentCount}</strong></article></section>
        {tab === "reviews" ? <section className={styles.list}><header><h2><History aria-hidden="true" /> 불변 조정 원장</h2></header>{result.data.reviews?.items.length ? result.data.reviews.items.map((item) => <article key={item.id} className={selectedReviewId === item.id ? styles.selected : undefined} aria-current={selectedReviewId === item.id ? "true" : undefined}><div><strong>{item.playerDisplayName}</strong><small>{item.playerId}</small></div><b>{item.position ?? "종합"} {item.deltaBp > 0 ? "+" : ""}{item.deltaBp}bp</b><div><span>{item.reasonCode} · {new Date(item.createdAt).toLocaleString("ko-KR")}</span><p>{item.publicNote}</p></div></article>) : <p className={styles.empty}>수동 조정 이력이 없습니다.</p>}</section> : <section className={styles.list}><header><h2><Activity aria-hidden="true" /> 현재 플레이어 프로필</h2></header>{result.data.players?.items.length ? result.data.players.items.map((item) => <article key={item.playerId}><div><Link href={`/admin/players/${item.playerId}?tab=balance`}><strong>{item.displayName}</strong></Link><small>{item.riotId}</small></div><b>{item.overallScore.toFixed(2)}</b><div><span>신뢰도 {Math.round(item.confidence * 100)}%</span><p>표본 {item.sampleSize}</p></div></article>) : <p className={styles.empty}>계산된 프로필이 없습니다.</p>}</section>}
        <MmrAdminActions generation={result.data.summary.generation} allowed={session.role === "SUPER_ADMIN"} />
      </> : <section className={styles.state} role={result.state === "error" ? "alert" : "status"}><h2>MMR 저장소를 불러올 수 없습니다.</h2><p>데이터베이스와 migration 상태를 확인해 주세요.</p></section>}
    </main>
  );
}
