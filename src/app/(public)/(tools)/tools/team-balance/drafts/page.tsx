import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock3, FolderOpen, Scale } from "lucide-react";

import { requireApprovedAccountPage } from "@/modules/auth/infrastructure/server-authorization";
import { readSiteFeatureState } from "@/modules/operations/infrastructure/site-feature-access";
import { loadRuntimeTeamBalance, loadRuntimeTeamBalanceRecommendations } from "@/modules/team-tools/infrastructure/runtime-team-balance";
import { parseTeamBalanceDraftsPageQuery } from "@/modules/team-tools/infrastructure/team-recommendation-query";

import styles from "../../team-tools.module.css";
import { TeamToolNav } from "../../team-tool-nav";
import { TeamBalanceFeatureState } from "../team-balance-feature-state";
import { TeamBalanceRecommendationsPanel } from "./team-balance-recommendations-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "팀 밸런스 초안",
  description: "팀 밸런스 초안을 다시 확인하고 재평가·결과 등록 작업을 이어갑니다.",
  alternates: { canonical: "/tools/team-balance/drafts" },
  robots: { index: false, follow: false },
};

const statusLabel = Object.freeze({ EVALUATED: "평가됨", SAVED: "저장됨", ARCHIVED: "보관됨" });

function pageHref(page: number) {
  return page > 1 ? `/tools/team-balance/drafts?page=${page}` : "/tools/team-balance/drafts";
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export default async function TeamBalanceDraftsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireApprovedAccountPage("/tools/team-balance/drafts");
  const featureState = await readSiteFeatureState("teamBalance");
  if (featureState !== "enabled") return <TeamBalanceFeatureState state={featureState} />;
  const query = parseTeamBalanceDraftsPageQuery(await searchParams);
  const listQuery = query?.view === "drafts" ? query.list : { page: 1, pageSize: 50 };
  const result = query
    ? await loadRuntimeTeamBalance((service) => service.listDrafts(
        { actorUserAccountId: session.userId, authorization: "OWNER" },
        listQuery,
      ))
    : { state: "error" as const };
  const selectedDraftId = query?.view === "recommendations"
    ? query.draftId ?? (result.state === "ready" ? result.data.items[0]?.id ?? null : null)
    : null;
  const recommendation = query?.view === "recommendations" && selectedDraftId
    ? await loadRuntimeTeamBalanceRecommendations((service) => service.getRecommendation(
        { actorUserAccountId: session.userId, authorization: "OWNER" }, selectedDraftId, query.team,
      ))
    : null;

  return (
    <div className={`page-wrap ${styles.page}`}>
      <TeamToolNav current="drafts" approved />
      <section className={styles.draftListHeader} aria-labelledby="draft-list-title">
        <div>
          <span>{query?.view === "recommendations" ? "PICK · BAN" : "TEAM DRAFTS"}</span>
          <h1 id="draft-list-title">{query?.view === "recommendations" ? "저장 팀 밴픽 추천" : "팀 밸런스 초안"}</h1>
          <p>{query?.view === "recommendations" ? "선택한 저장 배치와 최신 시즌 챔피언 통계로 픽·상대 밴 후보를 확인합니다." : "생성된 팀 배치를 다시 열고, 통계가 달라졌다면 재평가한 뒤 결과 등록으로 이어갈 수 있어요."}</p>
        </div>
        <Link className={styles.primaryLink} href={query?.view === "recommendations" ? "/tools/team-balance/drafts" : "/tools/team-balance/drafts?view=recommendations"}>{query?.view === "recommendations" ? "초안 목록" : "밴픽 추천"}</Link>
      </section>

      {query?.view === "recommendations" && result.state === "ready" && result.data.items.length > 0 ? <>
        <form className={styles.recommendationSelector} action="/tools/team-balance/drafts" method="get">
          <input type="hidden" name="view" value="recommendations"/><input type="hidden" name="team" value={query.team}/>
          <label><span>저장 초안</span><select name="draftId" defaultValue={selectedDraftId ?? ""}>{result.data.items.map((draft) => <option key={draft.id} value={draft.id}>{draft.title} · {statusLabel[draft.status]}</option>)}</select></label>
          <button type="submit">추천 불러오기</button>
        </form>
        {recommendation?.state === "ready" && recommendation.data ? <TeamBalanceRecommendationsPanel recommendation={recommendation.data} hrefForTeam={(team) => `/tools/team-balance/drafts?view=recommendations&draftId=${selectedDraftId}&team=${team}`}/>
          : <section className={styles.emptyState} role={recommendation?.state === "error" ? "alert" : "status"}><Scale aria-hidden="true"/><h2>밴픽 추천을 불러올 수 없어요</h2><p>잠시 후 다시 시도하거나 팀 구성을 확인해 주세요.</p></section>}
      </> : query?.view === "recommendations" && result.state === "ready" ? <section className={styles.emptyState}><FolderOpen aria-hidden="true"/><h2>추천할 저장 초안이 없습니다.</h2><p>추천 팀 배치를 저장한 뒤 다시 확인해 주세요.</p><Link className={styles.primaryLink} href="/tools/team-balance">첫 초안 만들기</Link></section>
      : result.state === "unavailable" ? (
        <section className={styles.emptyState} role="status"><Scale aria-hidden="true" /><h2>저장한 초안을 확인할 수 없어요</h2><p>잠시 후 다시 확인해 주세요.</p></section>
      ) : result.state === "error" ? (
        <section className={styles.emptyState} role="alert"><FolderOpen aria-hidden="true" /><h2>초안 목록을 불러오지 못했어요</h2><p>주소의 페이지 값을 확인하거나 잠시 후 다시 시도해 주세요.</p></section>
      ) : result.data.items.length === 0 ? (
        <section className={styles.emptyState}><FolderOpen aria-hidden="true" /><h2>아직 저장한 팀 초안이 없어요</h2><p>플레이어 10명을 골라 첫 균형 배치를 만들어 보세요.</p><Link className={styles.primaryLink} href="/tools/team-balance">첫 초안 만들기</Link></section>
      ) : (
        <>
          <div className={styles.draftList} aria-live="polite">
            {result.data.items.map((draft) => (
              <Link className={styles.draftListCard} href={`/tools/team-balance/drafts/${draft.id}`} key={draft.id}>
                <div>
                  <span data-status={draft.status}>{statusLabel[draft.status]}</span>
                  <h2>{draft.title}</h2>
                </div>
                <dl>
                  <div><dt>참가자</dt><dd>{draft.participantCount}명</dd></div>
                  <div><dt>평가</dt><dd>{draft.evaluationRound}회</dd></div>
                  <div><dt>수정</dt><dd><Clock3 size={13} aria-hidden="true" /> {displayDate(draft.updatedAt)}</dd></div>
                </dl>
                <ChevronRight size={19} aria-hidden="true" />
              </Link>
            ))}
          </div>

          {result.data.totalPages > 1 ? (
            <nav className={styles.draftPager} aria-label="팀 밸런스 초안 페이지">
              {result.data.currentPage > 1 ? (
                <Link href={pageHref(result.data.currentPage - 1)} rel="prev"><ChevronLeft size={16} aria-hidden="true" /> 이전</Link>
              ) : <span aria-disabled="true"><ChevronLeft size={16} aria-hidden="true" /> 이전</span>}
              <strong aria-current="page">{result.data.currentPage} / {result.data.totalPages}</strong>
              {result.data.currentPage < result.data.totalPages ? (
                <Link href={pageHref(result.data.currentPage + 1)} rel="next">다음 <ChevronRight size={16} aria-hidden="true" /></Link>
              ) : <span aria-disabled="true">다음 <ChevronRight size={16} aria-hidden="true" /></span>}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
