import Link from "next/link";

import { RiotAdminActions, RiotAdminGlobalActions } from "@/components/riot/riot-admin-actions";
import styles from "@/components/riot/riot-workspace.module.css";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { parseAdminRiotQuery } from "@/modules/riot";
import { loadRuntimeRiot } from "@/modules/riot/infrastructure/runtime-riot";

export const dynamic = "force-dynamic";

export default async function AdminRiotPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePageRole("ADMIN", "/admin/riot");
  const raw = await searchParams; const url = new URL("https://v2.invalid/admin/riot");
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string") url.searchParams.set(key, value); else if (value) for (const item of value) url.searchParams.append(key, item);
  const query = parseAdminRiotQuery(url.href) ?? { tab: "accounts" as const, status: "ALL" as const, page: 1, pageSize: 25 };
  const result = await loadRuntimeRiot((runtime) => runtime.query.listAdmin(query));
  return <main className={styles.page}>
    <header className={styles.hero}><div><span>RIOT OPERATIONS</span><h1>Riot 연동 운영</h1><p>계정 연결, 동기화 큐와 실패 상태를 한 화면에서 관리합니다.</p></div></header>
    <nav className={styles.tabs} aria-label="Riot 관리자 탭"><Link href="/admin/riot?tab=accounts" aria-current={query.tab === "accounts" ? "page" : undefined}>계정</Link><Link href="/admin/riot?tab=sync" aria-current={query.tab === "sync" ? "page" : undefined}>동기화</Link><Link href="/admin/riot?tab=logs" aria-current={query.tab === "logs" ? "page" : undefined}>안전 로그</Link></nav>
    <section className={styles.card}><h2>연동 작업</h2><p>단일 연결은 ADMIN, 선택 일괄·전체 동기화는 SUPER_ADMIN 세션과 TOTP를 transaction 안에서 다시 확인합니다.</p><RiotAdminGlobalActions superAdmin={session.role === "SUPER_ADMIN"} items={result.state === "ready" ? result.data.items : []} /></section>
    {result.state === "unavailable" ? <section className={styles.state} role="status"><h2>Riot 운영 adapter가 비활성 상태입니다.</h2><p>운영 feature flag는 기본적으로 꺼져 있으며 실제 credential을 사용하지 않습니다.</p></section>
      : result.state === "error" ? <section className={styles.state} data-tone="error" role="alert"><h2>Riot 운영 정보를 불러오지 못했습니다.</h2><p>저장소와 권한 상태를 확인해 주세요.</p></section>
      : result.data.items.length === 0 ? <section className={styles.state}><h2>표시할 연동 계정이 없습니다.</h2><p>조건을 바꾸거나 승인된 플레이어 연결을 기다려 주세요.</p></section>
      : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>플레이어</th><th>Riot ID</th><th>연결</th><th>동기화</th><th>작업</th></tr></thead><tbody>{result.data.items.map((row) => <tr key={row.playerId}><td><strong>{row.displayName}</strong><small>{row.playerId}</small></td><td>{row.riotId}</td><td><span className={styles.status}>{row.status}</span><small>{row.method ?? "연결 방식 없음"}</small></td><td>{row.lastSyncStatus ?? "요청 없음"}<small>{row.failureCode ?? row.lastSyncedAt ?? "-"}</small></td><td>{row.linkId ? <RiotAdminActions linkId={row.linkId} failed={row.lastSyncStatus === "FAILED"} /> : <Link href={`/admin/players/${row.playerId}?tab=riot`}>플레이어에서 연결</Link>}</td></tr>)}</tbody></table></div>}
  </main>;
}
