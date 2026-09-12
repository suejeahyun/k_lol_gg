import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarCheck2, Gamepad2, Swords } from "lucide-react";

import { AccountLogoutButton } from "@/components/accounts/account-logout-button";
import { AccountPlayerForm } from "@/components/accounts/account-player-form";
import { AccountShell } from "@/components/accounts/account-shell";
import styles from "@/components/accounts/account-access.module.css";
import type { AccountSelfDto } from "@/modules/accounts/domain/account-contracts";
import { accountRoleLabel } from "@/modules/accounts/domain/account-display-labels";
import { publicCompetitionStatusLabel, publicParticipationStatusLabel } from "@/modules/competitions/core";
import { getRuntimeAccountRepository } from "@/modules/accounts/infrastructure/runtime-account-data";
import { requireAccountPage } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeDiscipline } from "@/modules/discipline/infrastructure/runtime-discipline";
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

function participationStatusLabel(status: string) {
  const [competition, application] = status.split(":", 2);
  return [publicCompetitionStatusLabel(competition), application ? publicParticipationStatusLabel(application) : null].filter(Boolean).join(" · ");
}

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
  const [account, participations, disciplineResult] = await Promise.all([
    repository ? repository.findSelf(session.userId).catch(() => null) : null,
    repository ? repository.findSelfParticipations(session.userId).catch(() => null) : null,
    loadRuntimeDiscipline((service) => service.adapter.getOwnerOverview(session.userId)),
  ]);
  const rawTab = (await searchParams).tab;
  const tab = (Array.isArray(rawTab) ? rawTab[0] : rawTab) === "player" ? "player" : "overview";
  if (!account) {
    return <AccountShell activeTab="overview" title="내 계정" description="계정 상태와 연결된 플레이어 정보를 관리하세요."><section className={styles.panel} role="alert"><h1>계정 정보를 불러오지 못했습니다.</h1><p>잠시 후 다시 시도해 주세요.</p></section></AccountShell>;
  }
  return (
    <AccountShell activeTab={tab} title={account.loginId} description="계정 상태와 연결된 플레이어 정보를 관리하세요." status={{ label: statusLabels[account.status], state: account.status }} action={<AccountLogoutButton />}>
      {account.mustChangePassword ? <p className={styles.notice}>임시 비밀번호를 사용 중입니다. 다른 기능을 사용하기 전에 <Link href="/account/password?required=1">비밀번호를 변경해 주세요.</Link></p> : null}
      {tab === "overview" ? (
        <>
          <section className={styles.panel}><h2>계정 상태</h2><dl className={styles.facts}><div><dt>상태</dt><dd>{statusLabels[account.status]}</dd></div><div><dt>역할</dt><dd>{accountRoleLabel(account.role)}</dd></div><div><dt>상태 변경</dt><dd>{formatOptionalKoreanDateTime(account.statusChangedAt)}</dd></div><div><dt>비밀번호 변경</dt><dd>{formatOptionalKoreanDateTime(account.passwordChangedAt)}</dd></div></dl><p className={styles.notice}>{account.statusReason ?? defaultStatusMessages[account.status]}</p></section>
          <section className={styles.panel} aria-labelledby="my-player-title">
            <div className={styles.panelHeading}>
              <div><span className={styles.eyebrow}><Gamepad2 aria-hidden="true" /> MY PLAYER</span><h2 id="my-player-title">Riot ID·티어</h2></div>
              <Link href="/account?tab=player">{account.status === "APPROVED" && account.player?.status === "ACTIVE" ? "Riot ID·티어 변경" : "플레이어 정보 확인"}</Link>
            </div>
            {account.player ? <dl className={styles.facts}><div><dt>Riot ID</dt><dd>{account.player.riotId}</dd></div><div><dt>현재 티어</dt><dd>{account.player.currentTier ?? "미입력"}</dd></div><div><dt>최고 티어</dt><dd>{account.player.peakTier ?? "미입력"}</dd></div></dl> : <p className={styles.notice}>연결된 플레이어가 없습니다. 관리자에게 가입 신청 정보를 확인해 달라고 요청해 주세요.</p>}
          </section>
          <section className={styles.panel} aria-labelledby="my-participations-title"><div className={styles.panelHeading}><div><span className={styles.eyebrow}><CalendarCheck2 aria-hidden="true" /> MY ACTIVITY</span><h2 id="my-participations-title">내 이벤트·내전 기록</h2></div><Link href="/matches">전체 내전 보기</Link></div>
            {participations === null ? <p className={styles.notice} role="alert">참여 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p> : participations.length === 0 ? <p className={styles.empty}>연결된 플레이어의 공개 내전 또는 대회 참가 기록이 아직 없습니다.</p> : <div className={styles.activityGrid}>{participations.map((item) => {
              const href = item.kind === "MATCH" ? `/matches/${item.id}` : item.kind === "EVENT" ? `/competitions/events/${item.id}` : `/competitions/destruction/${item.id}`;
              const kindLabel = item.kind === "MATCH" ? "내전" : item.kind === "EVENT" ? "이벤트전" : "멸망전";
              return <Link href={href} key={`${item.kind}-${item.id}`}><span>{item.kind === "MATCH" ? <Gamepad2 aria-hidden="true" /> : <Swords aria-hidden="true" />}{kindLabel} · {participationStatusLabel(item.status)}</span><strong>{item.title}</strong><small>{formatOptionalKoreanDateTime(item.occurredOn)} · 상세 보기</small></Link>;
            })}</div>}
          </section>
          <section className={styles.panel} aria-labelledby="my-discipline-title"><div className={styles.panelHeading}><div><span className={styles.eyebrow}><AlertTriangle aria-hidden="true" /> SAFETY STATUS</span><h2 id="my-discipline-title">현재 주의·경고·밴</h2></div><Link href="/account/discipline">상세·증빙 제출</Link></div>
            {disciplineResult.state === "ready" ? <><dl className={styles.disciplineCounts}><div><dt>주의</dt><dd>{disciplineResult.data.activeCounts.CAUTION}</dd></div><div><dt>경고</dt><dd>{disciplineResult.data.activeCounts.WARNING}</dd></div><div><dt>밴</dt><dd>{disciplineResult.data.activeCounts.BAN}</dd></div></dl><p className={styles.notice}>{disciplineResult.data.records.length > 0 ? "현재 적용 중인 기록이 있습니다. 상세에서 사유와 해소 과제를 확인하고 필요한 사진을 제출해 주세요." : "현재 적용 중인 주의·경고·밴 기록이 없습니다."}</p></> : <p className={styles.notice} role={disciplineResult.state === "error" ? "alert" : "status"}>제재 상태를 불러오지 못했습니다. 경고·증빙 화면에서 다시 확인해 주세요.</p>}
          </section>
        </>
      ) : (
        <section className={styles.panel}><h2>연결 플레이어</h2>{account.player ? <><dl className={styles.facts}><div><dt>Riot ID</dt><dd>{account.player.riotId}</dd></div><div><dt>플레이어 상태</dt><dd>{account.player.status === "ACTIVE" ? "활성" : "비활성"}</dd></div><div><dt>현재 티어</dt><dd>{account.player.currentTier ?? "미입력"}</dd></div><div><dt>최고 티어</dt><dd>{account.player.peakTier ?? "미입력"}</dd></div></dl>{account.status === "APPROVED" && account.player.status === "ACTIVE" ? <AccountPlayerForm player={account.player} /> : <p className={styles.notice}>승인된 활성 플레이어만 본인 정보를 수정할 수 있습니다.</p>}</> : account.playerClaim ? <p className={styles.notice}>{playerClaimMessage(account.playerClaim)}</p> : <p>연결된 플레이어가 없습니다. 관리자에게 가입 신청 정보를 확인해 달라고 요청해 주세요.</p>}</section>
      )}
    </AccountShell>
  );
}
