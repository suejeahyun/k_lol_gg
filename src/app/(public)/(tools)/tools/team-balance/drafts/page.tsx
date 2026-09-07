import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock3, FolderOpen, Plus, Scale } from "lucide-react";

import { requireApprovedAccountPage } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeTeamBalance } from "@/modules/team-tools/infrastructure/runtime-team-balance";
import { parseTeamBalanceDraftListQuery } from "@/modules/team-tools/infrastructure/team-balance-query";

import styles from "../../team-tools.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "내 팀 밸런스 초안",
  description: "저장한 팀 밸런스 초안을 다시 확인하고 이어서 작업합니다.",
  alternates: { canonical: "/tools/team-balance/drafts" },
  robots: { index: false, follow: false },
};

const statusLabel = Object.freeze({ EVALUATED: "평가됨", SAVED: "저장됨", ARCHIVED: "보관됨" });

function urlFromSearchParams(input: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) value.forEach((entry) => params.append(key, entry));
    else if (value !== undefined) params.set(key, value);
  }
  return `http://local/tools/team-balance/drafts?${params}`;
}

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
  const query = parseTeamBalanceDraftListQuery(urlFromSearchParams(await searchParams));
  const result = query
    ? await loadRuntimeTeamBalance((service) => service.listDrafts(
        { actorUserAccountId: session.userId, authorization: "OWNER" },
        query,
      ))
    : { state: "error" as const };

  return (
    <div className={`page-wrap ${styles.page}`}>
      <section className={styles.draftListHeader} aria-labelledby="draft-list-title">
        <div>
          <span>MY TEAM DRAFTS</span>
          <h1 id="draft-list-title">내 팀 밸런스 초안</h1>
          <p>계정에 안전하게 저장된 배치를 다시 열고, 통계가 달라졌다면 재평가할 수 있어요.</p>
        </div>
        <Link className={styles.primaryLink} href="/tools/team-balance"><Plus size={16} aria-hidden="true" /> 새 팀 계산</Link>
      </section>

      {result.state === "unavailable" ? (
        <section className={styles.emptyState} role="status"><Scale aria-hidden="true" /><h2>팀 초안 연결을 준비하고 있어요</h2><p>데이터베이스 연결이 준비되면 저장한 초안이 여기에 표시됩니다.</p></section>
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
