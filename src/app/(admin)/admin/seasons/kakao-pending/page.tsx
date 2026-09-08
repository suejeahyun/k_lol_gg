import Link from "next/link";
import { Database, Filter, MessageCircleQuestion } from "lucide-react";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { parseAdminKakaoPendingQuery } from "@/modules/seasons/infrastructure/admin-kakao-pending-query";
import { loadRuntimeSeasonData } from "@/modules/seasons/infrastructure/runtime-season-data";

import styles from "./pending.module.css";

export const dynamic = "force-dynamic";

function pageHref(search: URLSearchParams, page: number) {
  const next = new URLSearchParams(search);
  next.set("page", String(page));
  return `/admin/seasons/kakao-pending?${next.toString()}`;
}

export default async function KakaoPendingApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageRole("ADMIN", "/admin/seasons/kakao-pending");
  const raw = await searchParams;
  const url = new URL("http://local.test/admin/seasons/kakao-pending");
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") url.searchParams.set(key, value);
    else if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, item);
  }
  let queryError = false;
  let query;
  try {
    query = parseAdminKakaoPendingQuery(url.toString());
  } catch {
    queryError = true;
    query = { page: 1, pageSize: 20, status: "ACTIVE" as const };
  }
  const result = await loadRuntimeSeasonData(async (service) => ({
    pending: await service.getKakaoPendingApplications(query),
    seasons: (await service.getAdminWorkspace({ page: 1, pageSize: 1 })).seasons,
  }));
  const pagination = new URLSearchParams();
  if (query.seasonId) pagination.set("seasonId", query.seasonId);
  if (query.applyDate) pagination.set("applyDate", query.applyDate);
  if (query.recruitNo) pagination.set("recruitNo", String(query.recruitNo));
  if (query.matchState) pagination.set("matchState", query.matchState);
  if (query.status) pagination.set("status", query.status);
  if (query.query) pagination.set("q", query.query);
  if (query.pageSize !== 20) pagination.set("limit", String(query.pageSize));

  return <main className={styles.page} data-admin-season-view="kakao-pending">
    <header className={styles.header}>
      <div><span>KAKAO REVIEW</span><h1>Kakao 보류 신청</h1><p>자동 일치가 안전하지 않았던 회차별 신청을 찾고, 사람이 플레이어를 확인한 뒤 일반 시즌 신청으로 연결합니다.</p></div>
      <Link href="/admin/seasons">시즌·참가로 돌아가기</Link>
    </header>
    {result.state !== "ready" ? <section className={styles.state} role={result.state === "error" ? "alert" : "status"}><Database aria-hidden="true" /><h2>보류 신청을 불러오지 못했습니다.</h2><p>운영 DB 연결을 확인한 뒤 다시 시도해 주세요.</p></section> : <>
      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span>FILTERED QUEUE</span><h2>검토 목록</h2></div><strong>{result.data.pending.totalCount}건</strong></div>
        <form className={styles.filters} method="get" action="/admin/seasons/kakao-pending">
          <Filter aria-hidden="true" />
          <label><span>이름·Riot ID</span><input name="q" maxLength={80} defaultValue={query.query} /></label>
          <label><span>시즌</span><select name="seasonId" defaultValue={query.seasonId ?? ""}><option value="">전체</option>{result.data.seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>
          <label><span>신청일</span><input type="date" name="applyDate" defaultValue={query.applyDate} /></label>
          <label><span>회차</span><input type="number" name="recruitNo" min={1} max={999} defaultValue={query.recruitNo} /></label>
          <label><span>일치 상태</span><select name="matchState" defaultValue={query.matchState ?? ""}><option value="">전체</option><option value="MATCHED_RESERVE">예비 자동 일치</option><option value="UNMATCHED">미일치</option><option value="AMBIGUOUS">동명이인</option></select></label>
          <label><span>처리 상태</span><select name="status" defaultValue={query.status ?? ""}><option value="">전체</option><option value="ACTIVE">대기</option><option value="RESOLVED">해결</option><option value="CANCELLED">취소</option></select></label>
          <button type="submit">조회</button><Link href="/admin/seasons/kakao-pending">초기화</Link>
        </form>
        {queryError ? <p className={styles.notice} role="alert">허용되지 않거나 올바르지 않은 조회 조건을 초기화했습니다.</p> : null}
        {result.data.pending.applications.length === 0 ? <div className={styles.empty}><MessageCircleQuestion aria-hidden="true" /><p>조건에 맞는 Kakao 보류 신청이 없습니다.</p></div> : <ul className={styles.list}>{result.data.pending.applications.map((application) => <li key={application.id}>
          <div><b data-status={application.status}>{application.status === "ACTIVE" ? "대기" : application.status === "RESOLVED" ? "해결" : "취소"}</b><strong>{application.suppliedName}</strong><small>{application.suppliedRiotId ?? "Riot ID 미제공"}</small></div>
          <dl><div><dt>시즌·회차</dt><dd>{application.seasonName}<small>{application.applyDate} · {application.recruitNo}회차 · 슬롯 {application.slotNo}</small></dd></div><div><dt>판정</dt><dd>{application.matchState}<small>{application.mainPosition} · {application.subPositions.join(" / ") || "부라인 없음"}</small></dd></div></dl>
          <Link href={`/admin/seasons/kakao-pending/${application.id}`}>상세 검토</Link>
        </li>)}</ul>}
        {result.data.pending.totalPages > 1 ? <nav className={styles.pagination} aria-label="Kakao 보류 신청 페이지">{result.data.pending.page > 1 ? <Link href={pageHref(pagination, result.data.pending.page - 1)}>이전</Link> : <span aria-disabled="true">이전</span>}<strong>{result.data.pending.page} / {result.data.pending.totalPages}</strong>{result.data.pending.page < result.data.pending.totalPages ? <Link href={pageHref(pagination, result.data.pending.page + 1)}>다음</Link> : <span aria-disabled="true">다음</span>}</nav> : null}
      </section>
    </>}
  </main>;
}
