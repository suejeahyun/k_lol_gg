import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, Radio, ShieldCheck, UserRound, UsersRound } from "lucide-react";

import { AccountLogoutButton } from "@/components/accounts/account-logout-button";
import { AccountPlayerForm } from "@/components/accounts/account-player-form";
import styles from "@/components/accounts/account-access.module.css";
import type { AccountSelfDto } from "@/modules/accounts/domain/account-contracts";
import { accountRoleLabel } from "@/modules/accounts/domain/account-display-labels";
import { getRuntimeAccountRepository } from "@/modules/accounts/infrastructure/runtime-account-data";
import { requireAccountPage } from "@/modules/auth/infrastructure/server-authorization";
import { formatOptionalKoreanDateTime } from "@/platform/time/format-korean-date-time";

export const metadata: Metadata = { title: "내 계정" };
export const dynamic = "force-dynamic";

const statusLabels = { PENDING: "승인 대기", APPROVED: "승인됨", REJECTED: "거절됨", SUSPENDED: "이용 제한" } as const;

const defaultStatusMessages: Record<AccountSelfDto["status"], string> = {
  PENDING: "관리자 검토를 기다리고 있습니다.",
  APPROVED: "전체 사용자 기능을 사용할 수 있습니다.",
  REJECTED: "계정 승인이 거절되었습니다. 안내 사유를 확인하거나 관리자에게 문의해 주세요.",
  SUSPENDED: "계정 이용이 제한되어 있습니다. 안내 사유를 확인하거나 관리자에게 문의해 주세요.",
};

function playerClaimMessage(claim: NonNullable<AccountSelfDto["playerClaim"]>) {
  if (claim.status === "PENDING") {
    return `기존 플레이어 ${claim.requestedRiotId} 연결을 수동 검토 중입니다. Riot 소유권이 확인된 상태가 아니며, 관리자 승인 전에는 연결되지 않습니다.`;
  }
  if (claim.status === "REJECTED") {
    return `기존 플레이어 ${claim.requestedRiotId} 연결 검토가 종료되었습니다. 계정 상태의 안내 사유를 확인하거나 관리자에게 재검토를 요청해 주세요. 플레이어는 연결되지 않았습니다.`;
  }
  return `기존 플레이어 ${claim.requestedRiotId} 연결 기록을 확인하는 중입니다. 현재 플레이어 연결이 없으므로 관리자에게 상태 확인을 요청해 주세요.`;
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const session = await requireAccountPage("/account");
  const repository = getRuntimeAccountRepository();
  const account = repository ? await repository.findSelf(session.userId).catch(() => null) : null;
  const rawTab = (await searchParams).tab;
  const tab = (Array.isArray(rawTab) ? rawTab[0] : rawTab) === "player" ? "player" : "overview";
  if (!account) {
    return <div className={styles.page}><section className={styles.panel} role="alert"><h1>계정 정보를 불러오지 못했습니다.</h1><p>저장소 연결을 확인한 뒤 다시 시도해 주세요.</p></section></div>;
  }
  return (
    <div className={styles.page}>
      <header className={styles.accountHero}>
        <div><span className={styles.eyebrow}><UserRound aria-hidden="true" /> MY ACCOUNT</span><h1>{account.loginId}</h1><p>일반 계정 세션 · 관리자 권한으로 자동 승격되지 않음</p></div>
        <div><span className={styles.status} data-state={account.status}>{statusLabels[account.status]}</span><AccountLogoutButton /></div>
      </header>
      <nav className={styles.tabs} aria-label="계정 메뉴"><Link href="/account" aria-current={tab === "overview" ? "page" : undefined}><ShieldCheck aria-hidden="true" /> 상태</Link><Link href="/account?tab=player" aria-current={tab === "player" ? "page" : undefined}><UsersRound aria-hidden="true" /> 플레이어</Link><Link href="/account/riot"><Radio aria-hidden="true" /> Riot</Link><Link href="/account/password"><KeyRound aria-hidden="true" /> 비밀번호</Link></nav>
      {account.mustChangePassword ? <p className={styles.notice}>임시 비밀번호를 사용 중입니다. 다른 기능을 사용하기 전에 <Link href="/account/password?required=1">비밀번호를 변경해 주세요.</Link></p> : null}
      {tab === "overview" ? (
        <section className={styles.panel}><h2>계정 상태</h2><dl className={styles.facts}><div><dt>상태</dt><dd>{statusLabels[account.status]}</dd></div><div><dt>역할</dt><dd>{accountRoleLabel(account.role)}</dd></div><div><dt>상태 변경</dt><dd>{formatOptionalKoreanDateTime(account.statusChangedAt)}</dd></div><div><dt>비밀번호 변경</dt><dd>{formatOptionalKoreanDateTime(account.passwordChangedAt)}</dd></div></dl><p className={styles.notice}>{account.statusReason ?? defaultStatusMessages[account.status]}</p></section>
      ) : (
        <section className={styles.panel}><h2>연결 플레이어</h2>{account.player ? <><dl className={styles.facts}><div><dt>Riot ID</dt><dd>{account.player.riotId}</dd></div><div><dt>플레이어 상태</dt><dd>{account.player.status === "ACTIVE" ? "활성" : "비활성"}</dd></div><div><dt>현재 티어</dt><dd>{account.player.currentTier ?? "미입력"}</dd></div><div><dt>최고 티어</dt><dd>{account.player.peakTier ?? "미입력"}</dd></div></dl>{account.status === "APPROVED" && account.player.status === "ACTIVE" ? <AccountPlayerForm player={account.player} /> : <p className={styles.notice}>승인된 활성 플레이어만 본인 정보를 수정할 수 있습니다.</p>}</> : account.playerClaim ? <p className={styles.notice}>{playerClaimMessage(account.playerClaim)}</p> : <p>연결된 플레이어가 없습니다. 관리자에게 가입 신청 정보를 확인해 달라고 요청해 주세요.</p>}</section>
      )}
    </div>
  );
}
