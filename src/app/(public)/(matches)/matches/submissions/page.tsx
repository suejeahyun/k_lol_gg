import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import type { MatchSubmissionStatus } from "@/modules/matches";
import { parseOwnSubmissionQuery } from "@/modules/matches/infrastructure/match-query";
import { getRuntimeMatchService } from "@/modules/matches/infrastructure/runtime-match-data";

import styles from "../submit/submit.module.css";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<MatchSubmissionStatus, string> = {
  AWAITING_UPLOAD: "이미지 등록 중",
  PENDING_REVIEW: "검토 대기",
  APPROVED: "승인 완료",
  REJECTED: "거절",
  CANCELLED: "사용자 취소",
};

function queryUrl(input: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  }
  return `http://local/matches/submissions?${params}`;
}

export default async function OwnMatchSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getCurrentSession();
  const query = parseOwnSubmissionQuery(queryUrl(await searchParams));
  const service = getRuntimeMatchService();
  const result = session && query && service
    ? await service.listOwnSubmissions(session.userId, query).catch(() => null)
    : null;
  return <div className={`page-wrap ${styles.page}`}>
    <Link className="back-link" href="/matches/submit"><ArrowLeft size={16} aria-hidden="true" /> 결과 접수</Link>
    <section className={styles.hero}><p>MY SUBMISSIONS</p><h1>내 결과 접수 기록</h1><span>접수 코드로 이어서 이미지를 등록하거나 검토 결과를 확인할 수 있어요.</span></section>
    {!session ? <section className={styles.panel}><h2>로그인이 필요해요.</h2><Link className={styles.login} href="/login?next=%2Fmatches%2Fsubmissions">로그인</Link></section>
      : !query ? <section className={styles.panel} role="alert"><h2>목록 조건이 올바르지 않아요.</h2></section>
      : !result ? <section className={styles.panel} role="status"><h2>접수 기록을 불러오지 못했어요.</h2></section>
      : <>
        <form className={styles.historyFilters} action="/matches/submissions" method="get"><label>상태<select name="status" defaultValue={query.status ?? ""}><option value="">전체 상태</option>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="submit">적용</button></form>
        {result.items.length === 0 ? <section className={styles.panel}><h2>조건에 맞는 접수가 없어요.</h2></section> : <div className={styles.historyList}>{result.items.map((submission) => <article className={styles.historyCard} key={submission.id}><div><span>{STATUS_LABEL[submission.status]}</span><h2>{submission.title}</h2><p>{submission.organizer} · {submission.seriesNumber}회 · {submission.playedOn}</p><small>{submission.publicCode} · 이미지 {submission.receivedGameNumbers.length}/{submission.expectedGameCount}</small>{submission.publicReviewReason ? <p>검토 결과: {submission.publicReviewReason}</p> : null}</div><div>{submission.approvedMatchSeriesId ? <Link href={`/matches/${submission.approvedMatchSeriesId}`}>공개 경기 보기 <ChevronRight size={15} aria-hidden="true" /></Link> : submission.status !== "CANCELLED" ? <Link href={`/matches/submit?code=${submission.publicCode}`}>이어하기 <ChevronRight size={15} aria-hidden="true" /></Link> : null}</div></article>)}</div>}
        {result.nextCursor ? <nav className={styles.historyPager}><Link href={`/matches/submissions?${new URLSearchParams({ ...(query.status ? { status: query.status } : {}), cursor: result.nextCursor, pageSize: String(query.pageSize) })}`}>다음 기록 <ChevronRight size={15} aria-hidden="true" /></Link></nav> : null}
      </>}
  </div>;
}
