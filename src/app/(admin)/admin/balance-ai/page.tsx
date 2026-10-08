import Link from "next/link";
import { Activity, Database, History } from "@/components/theme/theme-icons";

import { isMmrUuid, MMR_POSITIONS, parseMmrPlayerQuery, parseMmrReviewQuery } from "@/modules/mmr";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { competitionPositionLabel } from "@/modules/competitions/core/display-projection";
import { loadRuntimeMmr } from "@/modules/mmr/infrastructure/runtime-mmr";

import { MmrAdminActions } from "./mmr-admin-actions";
import { TeamBalanceOverrideActions } from "./team-balance-override-actions";
import styles from "./mmr-admin.module.css";
import listStyles from "@/components/admin/media/admin-media.module.css";

export const dynamic = "force-dynamic";

export default async function AdminBalanceAiPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageRole("ADMIN", "/admin/balance-ai");
  const raw = await searchParams;
  const tab = raw.tab === "reviews" ? "reviews" : raw.tab === "players" ? "players" : "summary";
  const action = raw.action === "recalculate" ? "recalculate" : null;
  const selectedReviewId = typeof raw.review === "string" && isMmrUuid(raw.review)
    ? raw.review.toLocaleLowerCase("en-US")
    : null;
  const url = new URL("https://v2.invalid/admin/balance-ai");
  for (const [key, value] of Object.entries(raw)) {
    if (["tab", "action", "review"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((entry) => url.searchParams.append(key, entry));
    else if (typeof value === "string") url.searchParams.set(key, value);
  }
  const viewValid = (raw.tab === undefined || ["summary", "players", "reviews"].includes(String(raw.tab)) && !Array.isArray(raw.tab))
    && (raw.action === undefined || raw.action === "recalculate")
    && (raw.review === undefined || selectedReviewId !== null);
  const playerQuery = parseMmrPlayerQuery(url.href);
  const query = viewValid ? tab === "reviews" ? parseMmrReviewQuery(url.href) : playerQuery : null;
  const result = query ? await loadRuntimeMmr(async (service) => ({
    summary: await service.getSummary(),
    players: tab === "players" ? await service.listPlayers(playerQuery!) : null,
    reviews: tab === "reviews" ? await service.listAdjustments(query.page, query.pageSize) : null,
    review: tab === "reviews" && selectedReviewId ? await service.getAdjustment(selectedReviewId) : null,
  })) : { state: "invalid" as const };
  const selectedReview = result.state === "ready" ? result.data.review : null;
  const pageHref = (page: number) => {
    const params = new URLSearchParams({ tab, page: String(page), pageSize: String(query?.pageSize ?? 20) });
    if (tab === "players" && playerQuery?.query) params.set("q", playerQuery.query);
    if (tab === "players" && playerQuery?.position) params.set("position", playerQuery.position);
    return `/admin/balance-ai?${params}`;
  };
  const resetHref = `/admin/balance-ai?${new URLSearchParams({ tab, pageSize: String(query?.pageSize ?? 20) })}`;
  const tabHref = (target: "players" | "reviews") => `/admin/balance-ai?${new URLSearchParams({ tab: target, pageSize: String(query?.pageSize ?? 20) })}`;
  const page = result.state === "ready" ? tab === "players" ? result.data.players : result.data.reviews : null;
  const pageCount = Math.min(10_000, page?.totalPages ?? 0);
  const positionLabel = playerQuery?.position ? competitionPositionLabel(playerQuery.position) : "종합";

  return (
    <main className={styles.page}>
      <header className={styles.hero}><div><h1>내전 점수 · MMR 관리</h1></div><Database aria-hidden="true" /></header>
      <TeamBalanceOverrideActions allowed={session.role === "ADMIN" || session.role === "SUPER_ADMIN"} />
      <nav className={styles.tabs} aria-label="MMR 관리자 탭"><Link href="/admin/balance-ai" aria-current={tab === "summary" ? "page" : undefined}>요약</Link><Link href={tabHref("players")} aria-current={tab === "players" ? "page" : undefined}>플레이어</Link><Link href={tabHref("reviews")} aria-current={tab === "reviews" ? "page" : undefined}>조정 이력</Link></nav>
      {tab !== "summary" ? <form key={`${tab}:${query?.page ?? "invalid"}:${playerQuery?.query ?? ""}:${playerQuery?.position ?? ""}:${query?.pageSize ?? 20}`} className={listStyles.filters} action="/admin/balance-ai" method="get">
        <input type="hidden" name="tab" value={tab} />
        {tab === "players" ? <><label>플레이어 검색<input name="q" defaultValue={playerQuery?.query ?? ""} maxLength={64} placeholder="닉네임 또는 태그" /></label><label>기준 포지션<select name="position" defaultValue={playerQuery?.position ?? ""}><option value="">종합</option>{MMR_POSITIONS.map((position) => <option key={position} value={position}>{competitionPositionLabel(position)}</option>)}</select></label></> : null}
        <label>표시 개수<select name="pageSize" defaultValue={query?.pageSize ?? 20}>{[10, 20, 50].map((size) => <option key={size} value={size}>{size}개</option>)}</select></label><button type="submit" className={listStyles.submit}>적용</button>
        {tab === "players" && (playerQuery?.query || playerQuery?.position) ? <Link href={resetHref}>검색 초기화</Link> : null}
      </form> : null}
      {result.state === "ready" ? <>
        <section className={styles.summary}><article><span>집계 차수</span><strong>{result.data.summary.generation}</strong></article><article><span>경기 / 게임</span><strong>{result.data.summary.sourceMatchCount} / {result.data.summary.sourceGameCount}</strong></article><article><span>독립 반영 대기</span><strong>{result.data.summary.pendingSourceCount}</strong></article><article><span>수동 조정</span><strong>{result.data.summary.sourceAdjustmentCount}</strong></article></section>
        {result.data.summary.formulaTransition === "ADMIN_RECALCULATION_REQUIRED" ? <section className={styles.notice} role="alert" data-mmr-formula-transition="ADMIN_RECALCULATION_REQUIRED"><h2>MMR 공식 전환 재계산이 필요합니다</h2><p>현재 계산 버전 {result.data.summary.generation} · 공식 {result.data.summary.formulaVersion ?? "기존"} · V2_DETERMINISTIC_1 전환: 최고 관리자 재계산 필요 · 자동 전환 없음</p></section> : null}
        {tab === "reviews" ? <><section className={styles.list} data-mmr-state="reviews"><header><h2><History aria-hidden="true" /> 불변 조정 원장</h2></header>{result.data.reviews?.items.length ? result.data.reviews.items.map((item) => <article key={item.id} className={selectedReviewId === item.id ? styles.selected : undefined} aria-current={selectedReviewId === item.id ? "true" : undefined}><div><strong>{item.playerDisplayName}</strong><small>{item.playerId}</small></div><b>{item.position ? competitionPositionLabel(item.position) : "종합"} {item.deltaBp > 0 ? "+" : ""}{item.deltaBp}bp</b><div><span>{item.reasonCode} · {new Date(item.createdAt).toLocaleString("ko-KR")}</span><p>{item.publicNote}</p></div></article>) : <div className={styles.empty} role="status"><p>{result.data.reviews?.total ? "현재 페이지에 조정 이력이 없습니다." : "수동 조정 이력이 없습니다."}</p>{result.data.reviews?.total || (query?.page ?? 1) > 1 ? <Link href={pageHref(1)}>첫 페이지로</Link> : null}</div>}</section>{selectedReview ? <aside className={styles.reviewDrawer} aria-labelledby="selected-review-title" data-mmr-review-detail={selectedReview.id}><header><div><span>선택한 조정 원장</span><h2 id="selected-review-title">{selectedReview.playerDisplayName}</h2></div><Link href={pageHref(query?.page ?? 1)} aria-label="조정 원장 상세 닫기">닫기</Link></header><dl><div><dt>포지션</dt><dd>{selectedReview.position ? competitionPositionLabel(selectedReview.position) : "종합"}</dd></div><div><dt>조정값</dt><dd>{selectedReview.deltaBp > 0 ? "+" : ""}{selectedReview.deltaBp}bp</dd></div><div><dt>사유 코드</dt><dd>{selectedReview.reasonCode}</dd></div><div><dt>생성 시각</dt><dd>{new Date(selectedReview.createdAt).toLocaleString("ko-KR")}</dd></div></dl><p>{selectedReview.publicNote}</p><Link href={`/admin/players/${selectedReview.playerId}?tab=balance`}>플레이어 밸런스 상세 보기</Link></aside> : selectedReviewId ? <p className={styles.notice} role="status">해당 조정 원장을 찾을 수 없습니다.</p> : null}</> : tab === "players" ? <section className={styles.list} data-mmr-state="players"><header><h2><Activity aria-hidden="true" /> 현재 플레이어 프로필</h2></header>{result.data.players?.items.length ? result.data.players.items.map((item) => <article key={item.playerId}><div><Link href={`/admin/players/${item.playerId}?tab=balance`}><strong>{item.displayName}</strong></Link><small>{item.riotId}</small></div><b>{positionLabel} {(playerQuery?.position ? item.positions[playerQuery.position].score : item.overallScore).toFixed(2)}</b><div><span>종합 신뢰도 {Math.round(item.confidence * 100)}%</span><p>{positionLabel} 표본 {playerQuery?.position ? item.positions[playerQuery.position].sampleSize : item.sampleSize}</p></div></article>) : <div className={styles.empty} role="status"><p>{result.data.players?.total ? "현재 페이지에 플레이어가 없습니다." : playerQuery?.query ? "검색 조건에 맞는 플레이어가 없습니다." : "계산된 프로필이 없습니다."}</p>{result.data.players?.total || (query?.page ?? 1) > 1 ? <Link href={pageHref(1)}>첫 페이지로</Link> : null}</div>}</section> : <section className={styles.overview} data-mmr-state="summary"><h2>재계산 전 영향 확인</h2><Link href="/admin/balance-ai?tab=players">플레이어별 결과 확인</Link><Link href="/admin/balance-ai?tab=reviews">수동 조정 원장 확인</Link></section>}
        {page && page.items.length > 0 && pageCount > 1 ? <nav className="pagination" aria-label={tab === "players" ? "MMR 플레이어 목록 페이지" : "MMR 조정 이력 페이지"}>{page.page > 1 ? <Link href={pageHref(page.page - 1)} rel="prev">이전</Link> : <span aria-disabled="true">이전</span>}<strong aria-current="page">{page.page} / {pageCount}</strong>{page.page < pageCount ? <Link href={pageHref(page.page + 1)} rel="next">다음</Link> : <span aria-disabled="true">다음</span>}</nav> : null}
        <MmrAdminActions
          generation={result.data.summary.generation}
          formulaVersion={result.data.summary.formulaVersion}
          formulaTransition={result.data.summary.formulaTransition}
          allowed={session.role === "SUPER_ADMIN"}
          startWithRecalculateConfirmation={action === "recalculate"}
        />
      </> : <section className={styles.state} role={result.state === "invalid" || result.state === "error" ? "alert" : "status"}><h2>{result.state === "invalid" ? "목록 조건을 확인해 주세요." : "MMR 저장소를 불러올 수 없습니다."}</h2>{result.state === "invalid" ? <Link href={resetHref}>목록 초기화</Link> : <a href={pageHref(query?.page ?? 1)}>다시 불러오기</a>}</section>}
    </main>
  );
}
