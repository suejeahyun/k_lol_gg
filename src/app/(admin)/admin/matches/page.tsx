import Link from "next/link";
import { ChevronLeft, ChevronRight, FilePlus2 } from "lucide-react";

import type { AdminMatchQuery } from "@/modules/matches/application/ports/match-repository";
import { parseAdminMatchQuery } from "@/modules/matches/infrastructure/match-query";
import { loadRuntimeMatchData } from "@/modules/matches/infrastructure/runtime-match-data";

import styles from "./matches-admin.module.css";

export const dynamic = "force-dynamic";

const MATCH_STATUS_LABEL = { DRAFT: "초안", PUBLISHED: "공개", VOIDED: "무효화" } as const;
const SUBMISSION_STATUS_LABEL = {
  AWAITING_UPLOAD: "이미지 등록 중",
  PENDING_REVIEW: "검토 대기",
  APPROVED: "승인",
  REJECTED: "거절",
  CANCELLED: "사용자 취소",
} as const;

function queryUrl(input: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  }
  return `http://local/admin/matches?${params}`;
}

function pageHref(query: AdminMatchQuery, page: number) {
  const params = new URLSearchParams({ view: query.view, page: String(page), pageSize: String(query.pageSize) });
  if (query.query) params.set("q", query.query);
  if (query.season) params.set("season", query.season);
  if (query.matchStatus) params.set("matchStatus", query.matchStatus);
  if (query.submissionStatus) params.set("submissionStatus", query.submissionStatus);
  return `/admin/matches?${params}`;
}

export default async function AdminMatchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parsed = parseAdminMatchQuery(queryUrl(await searchParams));
  const query = parsed ?? { view: "matches" as const, page: 1, pageSize: 20 };
  const result = parsed
    ? await loadRuntimeMatchData(async (service) => ({
        workspace: await service.getAdminWorkspace(query),
        catalog: await service.getAdminEditorCatalog(),
      }))
    : { state: "error" as const };
  const workspace = result.state === "ready" ? result.data.workspace : null;
  const catalog = result.state === "ready" ? result.data.catalog : null;

  return <main className={styles.page}>
    <section className={styles.hero}>
      <div><p>A4 · MATCH OPERATIONS</p><h1>경기·결과</h1><p>초안, 공개, 무효화와 사용자 결과 접수를 한 작업대에서 관리합니다.</p></div>
      <Link href="/admin/matches/new"><FilePlus2 size={17} aria-hidden="true" /> 새 경기</Link>
    </section>
    <nav className={styles.tabs} aria-label="경기 관리 보기">
      <Link data-active={query.view === "matches"} href="/admin/matches?view=matches">경기</Link>
      <Link data-active={query.view === "submissions"} href="/admin/matches?view=submissions">결과 접수</Link>
    </nav>
    <form className={styles.filters} action="/admin/matches" method="get">
      <input type="hidden" name="view" value={query.view} />
      <label>검색<input name="q" defaultValue={query.query ?? ""} maxLength={100} placeholder={query.view === "matches" ? "경기 이름" : "접수 코드·주최자·제목"} /></label>
      <label>시즌<select name="season" defaultValue={query.season ?? ""}><option value="">전체 시즌</option>{query.view === "submissions" ? <option value="UNASSIGNED">시즌 미지정</option> : null}{catalog?.seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>
      {query.view === "matches"
        ? <label>상태<select name="matchStatus" defaultValue={query.matchStatus ?? ""}><option value="">전체 상태</option>{Object.entries(MATCH_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        : <label>상태<select name="submissionStatus" defaultValue={query.submissionStatus ?? ""}><option value="">전체 상태</option>{Object.entries(SUBMISSION_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      <button type="submit">필터 적용</button>
    </form>

    {!workspace ? <section className={styles.state} role="alert">관리 작업대 데이터를 불러오지 못했습니다.</section> : query.view === "matches" ? (
      workspace.matches.length === 0
        ? <section className={styles.state}>조건에 맞는 경기가 없습니다.</section>
        : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>경기</th><th>시즌</th><th>날짜</th><th>상태</th><th>게임</th><th>revision</th></tr></thead><tbody>{workspace.matches.map((match) => <tr key={match.id}><td><Link href={`/admin/matches/${match.id}`}>{match.title}</Link></td><td>{match.seasonName}</td><td>{match.playedOn}</td><td><span className={styles.status}>{MATCH_STATUS_LABEL[match.status]}</span></td><td>{match.blueWins}:{match.redWins} · {match.gameCount}게임</td><td>{match.revision}</td></tr>)}</tbody></table></div>
    ) : workspace.submissions.length === 0
      ? <section className={styles.state}>조건에 맞는 결과 접수가 없습니다.</section>
      : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>접수</th><th>주최/회차</th><th>날짜</th><th>시즌</th><th>상태</th><th>이미지</th></tr></thead><tbody>{workspace.submissions.map((submission) => <tr key={submission.id}><td><Link href={`/admin/matches/submissions/${submission.id}`}>{submission.publicCode}<br />{submission.title}</Link></td><td>{submission.organizer} · {submission.seriesNumber}회</td><td>{submission.playedOn}</td><td>{submission.seasonName ?? "미지정"}</td><td><span className={styles.status}>{SUBMISSION_STATUS_LABEL[submission.status]}</span></td><td>{submission.receivedGameNumbers.length}/{submission.expectedGameCount}</td></tr>)}</tbody></table></div>}

    {workspace && workspace.totalPages > 1 ? <nav className={styles.pagination} aria-label="관리 목록 페이지">
      {workspace.page > 1 ? <Link href={pageHref(query, workspace.page - 1)}><ChevronLeft size={16} aria-hidden="true" /> 이전</Link> : <span aria-disabled="true"><ChevronLeft size={16} aria-hidden="true" /> 이전</span>}
      <strong aria-current="page">{workspace.page} / {workspace.totalPages}</strong>
      {workspace.page < workspace.totalPages ? <Link href={pageHref(query, workspace.page + 1)}>다음 <ChevronRight size={16} aria-hidden="true" /></Link> : <span aria-disabled="true">다음 <ChevronRight size={16} aria-hidden="true" /></span>}
    </nav> : null}
  </main>;
}
