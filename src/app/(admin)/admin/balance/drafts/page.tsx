import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock3, FolderOpen, Scale } from "lucide-react";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeTeamBalance } from "@/modules/team-tools/infrastructure/runtime-team-balance";
import { parseTeamBalanceDraftListQuery } from "@/modules/team-tools/infrastructure/team-balance-query";

import styles from "@/app/(public)/(tools)/tools/team-tools.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "전체 팀 밸런스 초안", robots: { index: false, follow: false } };

const statusLabel = Object.freeze({ EVALUATED: "평가됨", SAVED: "저장됨", ARCHIVED: "보관됨" });

function queryUrl(input: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) value.forEach((entry) => query.append(key, entry));
    else if (value !== undefined) query.set(key, value);
  }
  return `http://local/admin/balance/drafts?${query}`;
}

function pageHref(page: number) {
  return page > 1 ? `/admin/balance/drafts?page=${page}` : "/admin/balance/drafts";
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
}

export default async function AdminTeamBalanceDraftsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePageRole("ADMIN", "/admin/balance/drafts");
  const query = parseTeamBalanceDraftListQuery(queryUrl(await searchParams));
  const result = query
    ? await loadRuntimeTeamBalance((service) => service.listDrafts({ actorUserAccountId: session.userId, authorization: "ADMIN" }, query))
    : { state: "error" as const };

  return <main className={`page-wrap ${styles.page}`}>
    <section className={styles.draftListHeader} aria-labelledby="admin-draft-list-title">
      <div><span>ADMIN TEAM DRAFTS</span><h1 id="admin-draft-list-title">전체 팀 밸런스 초안</h1><p>사용자가 저장한 배치를 삭제하거나 가장하지 않고, 계산 근거와 현재 상태를 읽기 전용으로 확인합니다.</p></div>
      <Link className={styles.primaryLink} href="/admin/balance"><Scale size={16} aria-hidden="true" /> 통계 작업대</Link>
    </section>
    {result.state === "ready" && result.data.items.length > 0 ? <>
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
