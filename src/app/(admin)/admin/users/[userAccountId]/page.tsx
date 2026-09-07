import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, KeyRound, ShieldCheck, UserRound } from "lucide-react";

import { AdminAccountActions } from "@/components/admin/accounts/admin-account-actions";
import styles from "@/components/admin/players/admin-players.module.css";
import { accountRoleLabel, playerStatusLabel } from "@/modules/accounts/domain/account-display-labels";
import { isCanonicalAccountUuid, parseLegacyAccountIntegerId } from "@/modules/accounts/domain/account-contracts";
import { getRuntimeAccountRepository } from "@/modules/accounts/infrastructure/runtime-account-data";
import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { formatKoreanDateTime } from "@/platform/time/format-korean-date-time";

export const dynamic = "force-dynamic";
const labels = { PENDING: "승인 대기", APPROVED: "승인됨", REJECTED: "거절됨", SUSPENDED: "이용 제한" } as const;

export default async function AdminUserDetailPage({ params }: { params: Promise<{ userAccountId: string }> }) {
  const rawId = (await params).userAccountId;
  const session = await requirePageRole("ADMIN", `/admin/users/${rawId}`);
  const repository = getRuntimeAccountRepository();
  if (!repository) return <main className={styles.page}><section className={styles.state} role="status"><h1>계정 정보를 확인할 수 없습니다.</h1></section></main>;
  const id = rawId;
  if (!isCanonicalAccountUuid(id)) {
    const legacyId = parseLegacyAccountIntegerId(id);
    if (legacyId === null) notFound();
    const mapped = await repository.resolveLegacyId(legacyId);
    if (!mapped) notFound();
    redirect(`/admin/users/${mapped}`);
  }
  const viewerRole = session.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN";
  // A resolved null is the only not-found signal. Storage/query failures must
  // reach this segment's retryable error boundary instead of being presented
  // to operators as evidence that an account does not exist.
  const account = await repository.findAdmin(id, viewerRole);
  if (!account) notFound();
  const actorRole = viewerRole;
  return <main className={styles.page}>
    <Link className={styles.ghostLink} href="/admin/users"><ArrowLeft aria-hidden="true" /> 계정 목록</Link>
    <header className={styles.detailHero}><span className={styles.avatar} aria-hidden="true">{account.loginId.slice(0, 1).toUpperCase()}</span><div><span className={styles.eyebrow}><UserRound aria-hidden="true" /> USER ACCOUNT</span><h1>{account.loginId}</h1><p>{account.id}</p></div><span className={styles.revision}><small>revision</small><strong>{account.revision}</strong></span></header>
    {account.deletedAt ? <p className={styles.inactiveNotice}>이 계정은 소프트 삭제 상태입니다. 플레이어 연결과 기록은 보존되어 있습니다.</p> : null}
    <div className={styles.detailGrid}><section className={styles.summaryCard}><h2>계정 요약</h2><dl className={styles.facts}><div><dt>상태</dt><dd><span className={styles.status} data-state={account.status}>{labels[account.status]}</span></dd></div><div><dt>역할</dt><dd>{accountRoleLabel(account.role)}</dd></div><div><dt>비밀번호</dt><dd>{!account.passwordConfigured ? "미설정 · 최고 관리자 초기화 필요" : account.mustChangePassword ? "변경 필요" : "정상"}</dd></div>{viewerRole === "SUPER_ADMIN" ? <div><dt>관리자 2단계 인증</dt><dd>{account.adminTotpSetupPending ? "등록 진행 중" : account.adminTotpConfigured ? `사용 중${account.adminTotpEnabledAt ? ` · ${formatKoreanDateTime(account.adminTotpEnabledAt)}` : ""}` : "미등록"}</dd></div> : null}<div><dt>복구 요청</dt><dd>{account.resetRequestPending ? "검토 대기" : "없음"}</dd></div><div><dt>사용자 안내 사유</dt><dd>{account.statusReason ?? "없음"}</dd></div><div><dt>V1 번호</dt><dd>{account.legacyId ?? "없음"}</dd></div></dl></section><section className={styles.accountCard}><h2>플레이어 연결</h2>{account.player ? <><span className={styles.integrationBadge}>{playerStatusLabel(account.player.status)}</span><p><strong>{account.player.memberName}</strong><br />{account.player.riotId}</p><Link className={styles.ghostLink} href={`/admin/players/${account.player.id}`}>플레이어 열기</Link></> : account.playerClaimReview ? <><span className={styles.integrationBadge}>수동 연결 검토</span><div className={styles.claimCompare}><div><small>가입자 입력</small><strong>{account.playerClaimReview.requestedMemberName}</strong><span>{account.playerClaimReview.requestedRiotId}</span></div><div><small>기존 플레이어</small><strong>{account.playerClaimReview.targetPlayer.memberName}</strong><span>{account.playerClaimReview.targetPlayer.riotId} · {playerStatusLabel(account.playerClaimReview.targetPlayer.status)}</span></div></div><p className={styles.inactiveNotice}>Riot 소유권은 확인되지 않았습니다. 두 정보를 대조하고 승인할 때 수동 검토 확인이 필요합니다.</p><Link className={styles.ghostLink} href={`/admin/players/${account.playerClaimReview.targetPlayer.id}`}>대상 플레이어 열기</Link></> : <p>연결 플레이어와 검토 대기 claim이 없습니다.</p>}</section></div>
    {account.resetRequestPending ? <aside className={styles.recovery}><div><h2><KeyRound aria-hidden="true" /> 비밀번호 복구 요청</h2><p>SUPER가 임시 비밀번호를 발급하면 요청이 원자적으로 해결됩니다.</p></div></aside> : null}
    <aside className={styles.notice}><ShieldCheck aria-hidden="true" /><p>민감한 운영 정보는 권한이 있는 관리자만 확인할 수 있습니다.</p></aside>
    <AdminAccountActions key={account.id} initialAccount={account} actor={{ id: session.userId, role: actorRole }} />
  </main>;
}
