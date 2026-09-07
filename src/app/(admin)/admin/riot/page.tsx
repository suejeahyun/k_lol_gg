import Link from "next/link";

import { RiotAdminActions, RiotAdminGlobalActions } from "@/components/riot/riot-admin-actions";
import styles from "@/components/riot/riot-workspace.module.css";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { parseAdminRiotQuery } from "@/modules/riot";
import { loadRuntimeRiot } from "@/modules/riot/infrastructure/runtime-riot";

export const dynamic = "force-dynamic";

const accountStatuses = ["ALL", "CONNECTED", "DISCONNECTED", "REVOKED", "UNLINKED", "FAILED"] as const;
const syncStatuses = ["ALL", "QUEUED", "RUNNING", "RETRY_WAIT", "SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED"] as const;
const logSources = ["ALL", "API", "SYNC", "AUDIT"] as const;

function dateTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value)) : "-";
}

export default async function AdminRiotPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePageRole("ADMIN", "/admin/riot");
  const raw = await searchParams;
  const url = new URL("https://v2.invalid/admin/riot");
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") url.searchParams.set(key, value);
    else if (value) for (const item of value) url.searchParams.append(key, item);
  }
  const query = parseAdminRiotQuery(url.href) ?? {
    tab: "accounts" as const,
    status: "ALL" as const,
    source: "ALL" as const,
    page: 1,
    pageSize: 25,
  };
  const result = await loadRuntimeRiot((runtime) => runtime.query.listAdmin(query));
  const ready = result.state === "ready" ? result.data : null;
  const count = ready ? (query.tab === "accounts" ? ready.items.length : query.tab === "sync" ? ready.syncItems.length : ready.logItems.length) : 0;

  return <main className={styles.page} data-riot-tab={query.tab}>
    <header className={styles.hero}><div><span>RIOT OPERATIONS</span><h1>Riot 연동 운영</h1><p>계정, 동기화 작업, 안전 로그를 분리해 현재 상태와 다음 조치를 확인합니다.</p></div></header>
    <nav className={styles.tabs} aria-label="Riot 관리자 탭"><Link href="/admin/riot?tab=accounts" aria-current={query.tab === "accounts" ? "page" : undefined}>계정</Link><Link href="/admin/riot?tab=sync" aria-current={query.tab === "sync" ? "page" : undefined}>동기화</Link><Link href="/admin/riot?tab=logs" aria-current={query.tab === "logs" ? "page" : undefined}>안전 로그</Link></nav>

    {query.tab === "accounts" ? <>
      <section className={styles.card} data-riot-state="accounts"><h2>Riot 계정 연결 현황</h2><p>승인된 플레이어의 연결 상태를 찾고, 단일 연결 또는 선택 일괄 동기화를 진행합니다.</p>
        <form className={styles.filterForm} method="get"><input type="hidden" name="tab" value="accounts" /><label htmlFor="riot-account-status">계정 상태</label><select id="riot-account-status" name="status" defaultValue={query.status}>{accountStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select><button type="submit">조회</button></form>
        <RiotAdminGlobalActions superAdmin={session.role === "SUPER_ADMIN"} items={ready?.items ?? []} />
      </section>
      {ready && ready.items.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>플레이어</th><th>Riot ID</th><th>연결</th><th>최근 동기화</th><th>작업</th></tr></thead><tbody>{ready.items.map((row) => <tr key={row.playerId}><td><Link href={`/admin/players/${row.playerId}?tab=riot`}><strong>{row.displayName}</strong></Link></td><td>{row.riotId}</td><td><span className={styles.status}>{row.status}</span><small>{row.method ?? "연결 방식 없음"}</small></td><td>{row.lastSyncStatus ?? "요청 없음"}<small>{row.failureCode ?? dateTime(row.lastSyncedAt)}</small></td><td>{row.linkId ? <RiotAdminActions linkId={row.linkId} failed={row.lastSyncStatus === "FAILED"} /> : <Link href={`/admin/players/${row.playerId}?tab=riot`}>플레이어에서 연결</Link>}</td></tr>)}</tbody></table></div> : null}
    </> : null}

    {query.tab === "sync" ? <section data-riot-state="sync"><div className={styles.card}><h2>Riot 동기화 작업 이력</h2><p>대기·실행·재시도·완료 상태와 시도 횟수를 실제 작업 단위로 확인합니다.</p><form className={styles.filterForm} method="get"><input type="hidden" name="tab" value="sync" /><label htmlFor="riot-sync-status">작업 상태</label><select id="riot-sync-status" name="status" defaultValue={query.status}>{syncStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select><button type="submit">조회</button></form></div>
      {ready && ready.syncItems.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>플레이어</th><th>상태</th><th>시도</th><th>요청·실행 시각</th><th>조치</th></tr></thead><tbody>{ready.syncItems.map((row) => <tr key={row.jobId}><td><strong>{row.displayName}</strong><small>{row.riotId}</small></td><td><span className={styles.status}>{row.status}</span><small>{row.failureCode ?? row.requestedBy}</small></td><td>{row.attemptCount} / {row.maximumAttempts}</td><td>{dateTime(row.requestedAt)}<small>{row.completedAt ? `완료 ${dateTime(row.completedAt)}` : `실행 가능 ${dateTime(row.availableAt)}`}</small></td><td>{row.status === "FAILED" ? <RiotAdminActions linkId={row.linkId} failed /> : "-"}</td></tr>)}</tbody></table></div> : null}
    </section> : null}

    {query.tab === "logs" ? <section data-riot-state="logs"><div className={styles.card}><h2>Riot API·동기화·감사 로그</h2><p>보호된 식별자나 credential 없이 API 결과, 이벤트 발행, 관리자 감사 기록을 확인합니다.</p><form className={styles.filterForm} method="get"><input type="hidden" name="tab" value="logs" /><label htmlFor="riot-log-source">로그 구분</label><select id="riot-log-source" name="source" defaultValue={query.source}>{logSources.map((source) => <option key={source} value={source}>{source}</option>)}</select><button type="submit">조회</button></form></div>
      {ready && ready.logItems.length ? <div className={styles.logList}>{ready.logItems.map((row) => <article key={row.id}><div><span className={styles.status}>{row.source}</span><strong>{row.title}</strong></div><p>{row.detail}</p><small>{row.status} · {dateTime(row.occurredAt)}</small></article>)}</div> : null}
    </section> : null}

    {result.state === "unavailable" ? <section className={styles.state} role="status"><h2>Riot 운영 adapter가 비활성 상태입니다.</h2><p>운영 feature flag와 필수 설정을 모두 확인해 주세요.</p></section>
      : result.state === "error" ? <section className={styles.state} data-tone="error" role="alert"><h2>Riot 운영 정보를 불러오지 못했습니다.</h2><p>저장소와 권한 상태를 확인해 주세요.</p></section>
      : count === 0 ? <section className={styles.state} role="status"><h2>{query.tab === "accounts" ? "표시할 연동 계정이 없습니다." : query.tab === "sync" ? "표시할 동기화 작업이 없습니다." : "표시할 안전 로그가 없습니다."}</h2><p>필터를 바꾸거나 새로운 작업이 기록된 뒤 다시 확인해 주세요.</p></section> : null}
  </main>;
}
