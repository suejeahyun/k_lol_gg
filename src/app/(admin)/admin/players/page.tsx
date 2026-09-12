import Link from "next/link";
import { ChevronLeft, ChevronRight, Database, LockKeyhole, Search, UserPlus, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import styles from "@/components/admin/players/admin-players.module.css";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { parseAdminPlayerQuery } from "@/modules/players/application/parse-admin-player-query";
import { loadRuntimeAdminPlayers } from "@/modules/players/infrastructure/runtime-admin-player-data";
import { accountRoleLabel } from "@/modules/accounts/domain/account-display-labels";

export const dynamic = "force-dynamic";

function toUrlSearchParams(values: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") params.append(key, value);
    else for (const item of value ?? []) params.append(key, item);
  }
  return params;
}

function pageHref(query: { query: string; status: string; pageSize: number }, page: number) {
  const params = new URLSearchParams();
  if (query.query) params.set("q", query.query);
  if (query.status !== "ALL") params.set("status", query.status);
  if (query.pageSize !== 20) params.set("pageSize", String(query.pageSize));
  if (page > 1) params.set("page", String(page));
  return `/admin/players${params.size ? `?${params}` : ""}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageRole("ADMIN", "/admin/players");
  const parsed = parseAdminPlayerQuery(toUrlSearchParams(await searchParams));
  const result = parsed.ok ? await loadRuntimeAdminPlayers(parsed.value) : null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}><UsersRound aria-hidden="true" /> S02 · 플레이어 등록부</span>
          <h1>플레이어 등록부</h1>
          <p>회원명은 이 관리자 경계 안에서만 조회하고, 공개 프로필은 UUID와 허용된 Riot 정보만 사용합니다.</p>
        </div>
        <Link className={styles.primaryLink} href="/admin/players/new"><UserPlus aria-hidden="true" /> 새 플레이어</Link>
      </header>

      <form className={styles.search} action="/admin/players" method="get" role="search">
        <label>
          플레이어 검색
          <input name="q" type="search" maxLength={100} defaultValue={parsed.ok ? parsed.value.query : ""} placeholder="회원명, 닉네임#태그, 기존 번호" />
        </label>
        <label>
          상태
          <select name="status" defaultValue={parsed.ok ? parsed.value.status : "ALL"}>
            <option value="ALL">전체</option>
            <option value="ACTIVE">활성</option>
            <option value="INACTIVE">비활성</option>
          </select>
        </label>
        <Button size="lg" type="submit"><Search aria-hidden="true" /> 조회</Button>
      </form>

      {!parsed.ok ? (
        <section className={styles.state} data-tone="error" role="alert">
          <Search aria-hidden="true" />
          <h2>조회 조건을 확인해 주세요.</h2>
          <p>검색어는 100자 이하이며 상태·페이지 조건은 한 번씩만 전달할 수 있습니다.</p>
          <Link className={styles.ghostLink} href="/admin/players">조건 초기화</Link>
        </section>
      ) : result?.state === "unavailable" ? (
        <section className={styles.state} role="status">
          <Database aria-hidden="true" />
          <h2>플레이어 정보를 확인할 수 없습니다.</h2>
          <p>잠시 후 다시 시도해 주세요.</p>
        </section>
      ) : result?.state === "error" ? (
        <section className={styles.state} data-tone="error" role="alert">
          <Database aria-hidden="true" />
          <h2>플레이어 등록부를 불러오지 못했습니다.</h2>
          <p>잠시 후 다시 시도해 주세요. 서버 상세 오류와 회원 정보는 화면에 노출하지 않습니다.</p>
        </section>
      ) : result?.state === "ready" ? (
        <>
          <div className={styles.summaryBar}>
            <span>{parsed.value.query ? `“${parsed.value.query}” 검색` : "전체 등록부"}</span>
            <strong>{result.data.totalCount}명</strong>
          </div>
          {result.data.items.length === 0 ? (
            <section className={styles.state}>
              <Search aria-hidden="true" />
              <h2>{parsed.value.query ? "일치하는 플레이어가 없습니다." : "등록된 플레이어가 없습니다."}</h2>
              <p>{parsed.value.query ? "회원명 또는 Riot ID 철자를 확인해 주세요." : "새 플레이어를 등록하면 감사 기록과 함께 이곳에 표시됩니다."}</p>
            </section>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>플레이어</th><th>회원명</th><th>V1 번호</th><th>티어</th><th>상태</th><th>계정</th><th>수정</th></tr></thead>
                <tbody>
                  {result.data.items.map((player) => (
                    <tr key={player.id}>
                      <td data-label="플레이어"><Link className={styles.playerLink} href={`/admin/players/${player.id}`}><strong>{player.nickname}#{player.tagLine}</strong><span>{player.id}</span></Link></td>
                      <td data-label="회원명"><span className={styles.private}><LockKeyhole aria-hidden="true" /> {player.memberName}</span></td>
                      <td data-label="V1 번호">{player.legacyId ?? "—"}</td>
                      <td data-label="티어">{player.currentTier ?? "미등록"}</td>
                      <td data-label="상태"><span className={styles.status} data-state={player.status}>{player.status === "ACTIVE" ? "활성" : "비활성"}</span></td>
                      <td data-label="계정">{player.account ? `${player.account.loginId} · ${accountRoleLabel(player.account.role)}` : "미연결"}</td>
                      <td data-label="수정">{formatDate(player.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.data.totalPages > 1 ? (
            <nav className={styles.pagination} aria-label="플레이어 관리자 목록 페이지">
              {result.data.currentPage > 1 ? <Link href={pageHref(parsed.value, result.data.currentPage - 1)}><ChevronLeft aria-hidden="true" /> 이전</Link> : <span aria-disabled="true"><ChevronLeft aria-hidden="true" /> 이전</span>}
              <span aria-current="page">{result.data.currentPage} / {result.data.totalPages}</span>
              {result.data.currentPage < result.data.totalPages ? <Link href={pageHref(parsed.value, result.data.currentPage + 1)}>다음 <ChevronRight aria-hidden="true" /></Link> : <span aria-disabled="true">다음 <ChevronRight aria-hidden="true" /></span>}
            </nav>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
