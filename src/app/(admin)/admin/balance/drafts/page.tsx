import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock3, FolderOpen, Scale } from "lucide-react";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { readSiteFeatureState } from "@/modules/operations/infrastructure/site-feature-access";
import { loadRuntimeTeamBalance, loadRuntimeTeamBalanceRecommendations } from "@/modules/team-tools/infrastructure/runtime-team-balance";
import { parseTeamBalanceDraftsPageQuery } from "@/modules/team-tools/infrastructure/team-recommendation-query";
import { TeamBalanceFeatureState } from "@/app/(public)/(tools)/tools/team-balance/team-balance-feature-state";
import { TeamBalanceRecommendationsPanel } from "@/app/(public)/(tools)/tools/team-balance/drafts/team-balance-recommendations-panel";

import styles from "@/app/(public)/(tools)/tools/team-tools.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "전체 팀 밸런스 초안", robots: { index: false, follow: false } };

const statusLabel = Object.freeze({ EVALUATED: "평가됨", SAVED: "저장됨", ARCHIVED: "보관됨" });

function pageHref(page: number) {
  return page > 1 ? `/admin/balance/drafts?page=${page}` : "/admin/balance/drafts";
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
}

export default async function AdminTeamBalanceDraftsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePageRole("ADMIN", "/admin/balance/drafts");
  const featureState = await readSiteFeatureState("teamBalance");
  if (featureState !== "enabled") return <TeamBalanceFeatureState state={featureState} />;
  const query = parseTeamBalanceDraftsPageQuery(await searchParams);
  const listQuery = query?.view === "drafts" ? query.list : { page: 1, pageSize: 50 };
  const result = query
    ? await loadRuntimeTeamBalance((service) => service.listDrafts({ actorUserAccountId: session.userId, authorization: "ADMIN" }, listQuery))
    : { state: "error" as const };
  const selectedDraftId = query?.view === "recommendations" ? query.draftId ?? (result.state === "ready" ? result.data.items[0]?.id ?? null : null) : null;
  const recommendation = query?.view === "recommendations" && selectedDraftId
    ? await loadRuntimeTeamBalanceRecommendations((service) => service.getRecommendation({ actorUserAccountId: session.userId, authorization: "ADMIN" }, selectedDraftId, query.team))
    : null;

  return <main className={`page-wrap ${styles.page}`}>
    <section className={styles.draftListHeader} aria-labelledby="admin-draft-list-title">
      <div><span>{query?.view === "recommendations" ? "ADMIN PICK · BAN" : "ADMIN TEAM DRAFTS"}</span><h1 id="admin-draft-list-title">{query?.view === "recommendations" ? "전체 초안 밴픽 추천" : "전체 팀 밸런스 초안"}</h1><p>{query?.view === "recommendations" ? "선택된 배치와 실제 시즌 챔피언 통계를 관리자 범위에서 검수합니다." : "사용자가 저장한 배치를 삭제하거나 가장하지 않고, 계산 근거와 현재 상태를 읽기 전용으로 확인합니다."}</p></div>
      <Link className={styles.primaryLink} href={query?.view === "recommendations" ? "/admin/balance/drafts" : "/admin/balance/drafts?view=recommendations"}>{query?.view === "recommendations" ? "초안 목록" : "밴픽 추천"}</Link>
    </section>
    {query?.view === "recommendations" && result.state === "ready" && result.data.items.length > 0 ? <>
      <form className={styles.recommendationSelector} action="/admin/balance/drafts" method="get"><input type="hidden" name="view" value="recommendations"/><input type="hidden" name="team" value={query.team}/><label><span>검수 초안</span><select name="draftId" defaultValue={selectedDraftId ?? ""}>{result.data.items.map((draft) => <option key={draft.id} value={draft.id}>{draft.title} · {statusLabel[draft.status]}</option>)}</select></label><button type="submit">추천 불러오기</button></form>
      {recommendation?.state === "ready" && recommendation.data ? <TeamBalanceRecommendationsPanel recommendation={recommendation.data} hrefForTeam={(team) => `/admin/balance/drafts?view=recommendations&draftId=${selectedDraftId}&team=${team}`}/> : <section className={styles.emptyState} role={recommendation?.state === "error" ? "alert" : "status"}><Scale aria-hidden="true"/><h2>관리자 추천을 불러올 수 없습니다.</h2><p>초안과 통계 projection 상태를 확인해 주세요.</p></section>}
    </> : query?.view === "recommendations" && result.state === "ready" ? <section className={styles.emptyState}><FolderOpen aria-hidden="true"/><h2>검수할 팀 초안이 없습니다.</h2><p>사용자 초안이 생성되면 추천을 확인할 수 있습니다.</p></section>
    : result.state === "ready" && result.data.items.length > 0 ? <>
      <div className={styles.draftList} aria-live="polite">
        {result.data.items.map((draft) => <Link className={styles.draftListCard} href={`/admin/balance/drafts/${draft.id}`} key={draft.id}>
          <div><span data-status={draft.status}>{statusLabel[draft.status]}</span><h2>{draft.title}</h2></div>
          <dl><div><dt>참가자</dt><dd>{draft.participantCount}명</dd></div><div><dt>평가</dt><dd>{draft.evaluationRound}회</dd></div><div><dt>수정</dt><dd><Clock3 size={13} aria-hidden="true" /> {displayDate(draft.updatedAt)}</dd></div></dl>
          <ChevronRight size={19} aria-hidden="true" />
        </Link>)}
      </div>
      {result.data.totalPages > 1 ? <nav className={styles.draftPager} aria-label="관리자 팀 밸런스 초안 페이지">
        {result.data.currentPage > 1 ? <Link href={pageHref(result.data.currentPage - 1)} rel="prev"><ChevronLeft size={16} aria-hidden="true" /> 이전</Link> : <span aria-disabled="true"><ChevronLeft size={16} aria-hidden="true" /> 이전</span>}
        <strong aria-current="page">{result.data.currentPage} / {result.data.totalPages}</strong>
        {result.data.currentPage < result.data.totalPages ? <Link href={pageHref(result.data.currentPage + 1)} rel="next">다음 <ChevronRight size={16} aria-hidden="true" /></Link> : <span aria-disabled="true">다음 <ChevronRight size={16} aria-hidden="true" /></span>}
      </nav> : null}
    </> : result.state === "ready" ? <section className={styles.emptyState}><FolderOpen aria-hidden="true" /><h2>저장된 팀 초안이 없습니다.</h2><p>사용자가 팀 밸런스 초안을 만들면 이곳에 표시됩니다.</p></section>
      : <section className={styles.emptyState} role={result.state === "error" ? "alert" : "status"}><FolderOpen aria-hidden="true" /><h2>전체 초안 목록을 불러올 수 없습니다.</h2><p>데이터베이스 연결과 페이지 값을 확인해 주세요.</p></section>}
  </main>;
}
