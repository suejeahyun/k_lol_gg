import Link from "next/link";
import { ChevronLeft, ChevronRight, Database, KeyRound, Search, UserCheck, UsersRound } from "lucide-react";

import styles from "@/components/admin/players/admin-players.module.css";
import { parseAdminAccountQuery } from "@/modules/accounts/application/parse-admin-account-query";
import { accountRoleLabel } from "@/modules/accounts/domain/account-display-labels";
import { getRuntimeAccountRepository } from "@/modules/accounts/infrastructure/runtime-account-data";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";

export const dynamic = "force-dynamic";

function paramsFromRecord(values: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") params.append(key, value);
    else for (const item of value ?? []) params.append(key, item);
  }
  return params;
}

function pageHref(query: { query: string; status: string; role: string; deleted: string; pageSize: number }, page: number) {
  const params = new URLSearchParams();
  if (query.query) params.set("q", query.query);
  if (query.status !== "ALL") params.set("status", query.status);
  if (query.role !== "ALL") params.set("role", query.role);
  if (query.deleted !== "ACTIVE") params.set("deleted", query.deleted);
  if (query.pageSize !== 20) params.set("pageSize", String(query.pageSize));
  if (page > 1) params.set("page", String(page));
  return `/admin/users${params.size ? `?${params}` : ""}`;
}

const statusLabels = { PENDING: "승인 대기", APPROVED: "승인됨", REJECTED: "거절됨", SUSPENDED: "이용 제한" } as const;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePageRole("ADMIN", "/admin/users");
  const parsed = parseAdminAccountQuery(paramsFromRecord(await searchParams));
  const repository = getRuntimeAccountRepository();
  const viewerRole = session.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN";
  const result = parsed.ok && repository ? await repository.listAdmin(parsed.value, viewerRole).catch(() => null) : null;
  return (
    <main className={styles.page}>
      <header className={styles.header}><div><span className={styles.eyebrow}><UsersRound aria-hidden="true" /> S01 · ACCOUNT OPERATIONS</span><h1>사용자 계정</h1><p>가입 승인, 역할, 복구 요청과 소프트 삭제를 한 곳에서 revision 기반으로 관리합니다.</p></div><Link className={styles.ghostLink} href="/admin/players"><UserCheck aria-hidden="true" /> 플레이어 등록부</Link></header>
      <form className={styles.search} action="/admin/users" method="get" role="search">
        <label>계정 검색<input name="q" type="search" maxLength={100} defaultValue={parsed.ok ? parsed.value.query : ""} placeholder="아이디, 회원명, Riot ID, V1 번호" /></label>
        <label>상태<select name="status" defaultValue={parsed.ok ? parsed.value.status : "ALL"}><option value="ALL">전체 상태</option><option value="PENDING">승인 대기</option><option value="APPROVED">승인됨</option><option value="REJECTED">거절됨</option><option value="SUSPENDED">이용 제한</option></select></label>
        <button className={styles.primaryLink} type="submit"><Search aria-hidden="true" /> 조회</button>
        <label>역할<select name="role" defaultValue={parsed.ok ? parsed.value.role : "ALL"}><option value="ALL">전체 역할</option><option value="USER">일반 사용자 (USER)</option><option value="ADMIN">관리자 (ADMIN)</option><option value="SUPER_ADMIN">최고 관리자 (SUPER_ADMIN)</option></select></label>
        <label>삭제 범위<select name="deleted" defaultValue={parsed.ok ? parsed.value.deleted : "ACTIVE"}><option value="ACTIVE">활성 계정</option><option value="DELETED">삭제 계정</option><option value="ALL">모두</option></select></label>
      </form>
      {!parsed.ok ? <section className={styles.state} data-tone="error" role="alert"><Search aria-hidden="true" /><h2>조회 조건을 확인해 주세요.</h2><p>각 조건은 한 번만 전달하고 허용된 상태·역할·페이지 값만 사용해 주세요.</p><Link className={styles.ghostLink} href="/admin/users">조건 초기화</Link></section>
      : !repository ? <section className={styles.state} role="status"><Database aria-hidden="true" /><h2>V2 계정 저장소 연결이 필요합니다.</h2><p>합성 사용자로 대신 채우지 않습니다.</p></section>
      : !result ? <section className={styles.state} data-tone="error" role="alert"><Database aria-hidden="true" /><h2>계정 목록을 불러오지 못했습니다.</h2><p>잠시 후 다시 시도해 주세요.</p></section>
      : <><div className={styles.summaryBar}><span>{parsed.value.query ? `“${parsed.value.query}” 검색` : "계정 등록부"}</span><strong>{result.totalCount}개</strong></div>
        {result.items.length === 0 ? <section className={styles.state}><UsersRound aria-hidden="true" /><h2>조건에 맞는 계정이 없습니다.</h2><p>삭제 범위와 상태 필터를 바꿔 확인해 보세요.</p></section> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>계정</th><th>회원·Riot</th><th>상태</th><th>역할</th><th>복구 요청</th><th>삭제</th></tr></thead><tbody>{result.items.map((account) => <tr key={account.id}><td data-label="계정"><Link className={styles.playerLink} href={`/admin/users/${account.id}`}><strong>{account.loginId}</strong><span>{account.legacyId ? `V1 #${account.legacyId}` : account.id}</span></Link></td><td data-label="회원·Riot">{account.player ? <span className={styles.private}>{account.player.memberName}<br />{account.player.riotId}</span> : account.playerClaimReview ? <span className={styles.private}>수동 검토 · {account.playerClaimReview.requestedMemberName}<br />{account.playerClaimReview.requestedRiotId}</span> : "미연결"}</td><td data-label="상태"><span className={styles.status} data-state={account.status}>{statusLabels[account.status]}</span></td><td data-label="역할">{accountRoleLabel(account.role)}</td><td data-label="복구 요청">{account.resetRequestPending ? <span className={styles.private}><KeyRound aria-hidden="true" /> 대기</span> : "—"}</td><td data-label="삭제"><span className={styles.status} data-state={account.deletedAt ? "DELETED" : "APPROVED"}>{account.deletedAt ? "삭제됨" : "활성"}</span></td></tr>)}</tbody></table></div>}
        {result.totalPages > 1 ? <nav className={styles.pagination} aria-label="계정 목록 페이지">{result.currentPage > 1 ? <Link href={pageHref(parsed.value, result.currentPage - 1)}><ChevronLeft aria-hidden="true" /> 이전</Link> : <span aria-disabled="true">이전</span>}<span aria-current="page">{result.currentPage} / {result.totalPages}</span>{result.currentPage < result.totalPages ? <Link href={pageHref(parsed.value, result.currentPage + 1)}>다음 <ChevronRight aria-hidden="true" /></Link> : <span aria-disabled="true">다음</span>}</nav> : null}
      </>}
    </main>
  );
}
