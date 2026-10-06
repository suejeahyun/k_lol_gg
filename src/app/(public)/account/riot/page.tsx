import { createRouteMetadata } from "@/modules/seo/domain/site-seo";
import Link from "next/link";

import { AccountShell } from "@/components/accounts/account-shell";
import { RiotOwnerActions } from "@/components/riot/riot-owner-actions";
import styles from "@/components/accounts/account-access.module.css";
import { requireApprovedAccountPage } from "@/modules/auth/infrastructure/server-authorization";
import { publicRiotLinkMethodLabel, publicRiotLinkStatusLabel, publicRiotSyncStatusLabel } from "@/modules/competitions/core";
import { getRuntimeRiot, loadRuntimeRiot } from "@/modules/riot/infrastructure/runtime-riot";

export const metadata = createRouteMetadata("/account/riot");
export const dynamic = "force-dynamic";

export default async function AccountRiotPage() {
  const session = await requireApprovedAccountPage("/account/riot");
  const result = await loadRuntimeRiot((runtime) => runtime.query.getOwnerStatus(session.userId));
  const link = result.state === "ready" ? result.data?.link ?? null : null;
  const connected = link?.status === "CONNECTED";
  const rsoAvailable = getRuntimeRiot()?.rsoAvailable ?? false;
  return <AccountShell activeTab="riot" title="내 Riot 계정" status={{ label: link ? publicRiotLinkStatusLabel(link.status) : "승인된 계정", state: link?.status ?? "APPROVED" }} action={<Link className={styles.primaryLink} href="/help/riot">연동 도움말</Link>}>
    {result.state === "unavailable" ? <section className={styles.panel} role="status"><h2>Riot 연동을 준비하고 있어요.</h2></section>
      : result.state === "error" ? <section className={styles.panel} role="alert"><h2>연동 상태를 불러오지 못했습니다.</h2><p>잠시 후 다시 시도해 주세요.</p></section>
      : !result.data ? <section className={styles.panel} role="status"><h2>연결할 플레이어가 없습니다.</h2><p>먼저 관리자 승인을 받아 내 플레이어를 연결해 주세요.</p></section>
      : <div className={styles.accountGrid}>
        <section className={styles.panel}><h2>{connected ? "연결된 Riot 계정" : result.data.link ? "이전 Riot 연동" : "Riot 계정 연결"}</h2>{result.data.link ? <><dl className={styles.facts}><div><dt>Riot ID</dt><dd>{result.data.link.riotId}</dd></div><div><dt>연결 방식</dt><dd>{publicRiotLinkMethodLabel(result.data.link.method)}</dd></div><div><dt>상태</dt><dd>{publicRiotLinkStatusLabel(result.data.link.status)}</dd></div></dl>{result.data.link.method !== "RSO_VERIFIED" ? <p className={styles.notice}>공개 전적 연결 · Riot 계정 소유권 미인증</p> : null}{!connected ? <p className={styles.notice}>연동 해제됨 · 다시 연결 가능</p> : null}</> : null}<RiotOwnerActions linkRevision={result.data.link?.revision ?? 0} connected={connected} rsoAvailable={rsoAvailable} /></section>
        <section className={styles.panel}><h2>최근 동기화</h2>{result.data.lastSync ? <dl className={styles.facts}><div><dt>상태</dt><dd>{publicRiotSyncStatusLabel(result.data.lastSync.status)}</dd></div><div><dt>시도</dt><dd>{result.data.lastSync.attemptCount}회</dd></div><div><dt>오류</dt><dd>{result.data.lastSync.failureCode ?? "없음"}</dd></div></dl> : <p>아직 동기화 요청이 없습니다.</p>}{result.data.summary ? <p className={styles.notice}>{result.data.summary.soloTier ?? "랭크 없음"} {result.data.summary.soloRank ?? ""} · {result.data.summary.leaguePoints ?? 0} LP</p> : null}</section>
      </div>}
  </AccountShell>;
}
