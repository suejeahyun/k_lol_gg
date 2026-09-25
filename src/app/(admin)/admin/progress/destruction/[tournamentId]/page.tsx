import { DESTRUCTION_GAME_MODES } from "@/modules/competitions/destruction/aram-rating";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft, Gavel } from "lucide-react";
import { competitionPreliminaryFormatLabel } from "@/modules/competitions/core/display-projection";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { isDestructionUuid } from "@/modules/competitions/destruction";
import { getRuntimeDestruction } from "@/modules/competitions/destruction/runtime-destruction";
import { parseDestructionAdminDetailView } from "@/modules/competitions/public-navigation";
import { buildLegacyCanonicalIdDestination } from "@/modules/navigation/application/legacy-user-redirects";
import { parseLegacyIntegerId } from "@/platform/legacy-identifiers";

import styles from "../../event/event-admin.module.css";
import { DestructionAdminActions } from "./destruction-admin-actions";

export const dynamic = "force-dynamic";
import { DESTRUCTION_STEPS as stages, DESTRUCTION_STATUS_LABEL } from "@/modules/competitions/destruction/workflow";
import workspaceStyles from "@/components/competitions/destruction/workspace.module.css";

export default async function AdminDestructionDetailPage({ params, searchParams }: { params: Promise<{ tournamentId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { tournamentId: rawId } = await params;
  const session = await requirePageRole("ADMIN", `/admin/progress/destruction/${rawId}`);
  const canonicalId = isDestructionUuid(rawId);
  const legacyId = canonicalId ? null : parseLegacyIntegerId(rawId);
  if (!canonicalId && legacyId === null) notFound();
  const rawQuery = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(rawQuery)) {
    if (Array.isArray(value)) value.forEach((entry) => query.append(key, entry));
    else if (typeof value === "string") query.set(key, value);
  }
  const view = parseDestructionAdminDetailView(query);
  if (!view) notFound();
  const runtime = getRuntimeDestruction();
  if (!runtime) return <main className={styles.page}><section className={styles.state} role="status"><h1>멸망전 저장소를 준비하고 있습니다.</h1><p>잠시 후 다시 시도해 주세요.</p></section></main>;
  if (legacyId !== null) {
    let mappedId;
    try { mappedId = await runtime.repository.resolveLegacyId(legacyId); }
    catch { return <main className={styles.page}><section className={styles.state} role="alert"><h1>멸망전을 불러오지 못했습니다.</h1><p>잠시 후 다시 시도해 주세요.</p></section></main>; }
    if (!mappedId) notFound();
    permanentRedirect(buildLegacyCanonicalIdDestination(
      "/admin/progress/destruction",
      mappedId,
      "/admin/progress/destruction",
      { ...(view === "auction-live" ? { tab: "auction", mode: "live" } : {}), stage: query.get("stage") ?? undefined },
    ));
  }
  const tournamentId = rawId.toLocaleLowerCase("en-US");
  let workspace;
  try { workspace = await runtime.repository.getAdminWorkspace(tournamentId); }
  catch { return <main className={styles.page}><section className={styles.state} role="alert"><h1>멸망전을 불러오지 못했습니다.</h1><p>잠시 후 다시 시도해 주세요.</p></section></main>; }
  if (!workspace) notFound();
  const { destruction, playerOptions, playerLabels, galleryOptions } = workspace;
  const selectedStage = (query.get("stage") ?? (view === "auction-live" ? "AUCTION" : destruction.lifecycle.status === "CANCELLED" ? destruction.lifecycle.cancelledFrom ?? "PLANNED" : destruction.lifecycle.status)) as (typeof stages)[number];
  const teamLabels = new Map(destruction.teams.map((team) => [team.id, team.name]));
  return <main className={styles.page}>
    <Link href="/admin/progress/destruction"><ArrowLeft aria-hidden="true" /> 멸망전 목록</Link>
    <header className={styles.hero}><div><span><Gavel aria-hidden="true" /> {view === "auction-live" ? "LIVE AUCTION CONTROL" : competitionPreliminaryFormatLabel(destruction.configuration.preliminaryFormat)}</span><h1>{view === "auction-live" ? `${destruction.title} 실시간 경매` : destruction.title}</h1><p>{DESTRUCTION_GAME_MODES[destruction.configuration.gameMode ?? "CLASSIC"]} · {destruction.configuration.teamCount}팀 · 팀당 5명 · {(destruction.configuration.gameMode ?? "CLASSIC") === "CLASSIC" ? "포지션별 1명" : "포지션 구분 없음"}</p></div><div className={workspaceStyles.heroLinks}>{view === "auction-live" ? <Link href={`/admin/progress/destruction/${destruction.id}`}>일반 운영 화면</Link> : <Link href={`?tab=auction&mode=live`}>실시간 경매 화면</Link>}<Link href={`/competitions/destruction/${destruction.id}`}>공개 화면</Link></div></header>
    <nav aria-label="멸망전 진행 단계"><ol className={workspaceStyles.steps}>{stages.map((stage) => <li key={stage}><Link href={`?stage=${stage}`} scroll={false} prefetch={false} aria-current={selectedStage === stage ? "page" : undefined}>{DESTRUCTION_STATUS_LABEL[stage]}{destruction.lifecycle.status === stage ? <small>현재 진행</small> : null}</Link></li>)}</ol></nav>
    <section className={`${styles.summary} ${workspaceStyles.metrics}`}><article><span>현재 단계</span><strong>{DESTRUCTION_STATUS_LABEL[destruction.lifecycle.status]}</strong></article><article><span>참가자</span><strong>{destruction.participants.length}/{destruction.configuration.teamCount * 5}</strong></article><article><span>팀</span><strong>{destruction.teams.length}/{destruction.configuration.teamCount}</strong></article><article><span>우승</span><strong>{destruction.tournamentBracket?.championTeamId ? teamLabels.get(destruction.tournamentBracket.championTeamId) ?? "알 수 없는 팀" : "미정"}</strong></article></section>
    <DestructionAdminActions destruction={destruction} playerOptions={playerOptions} playerLabels={playerLabels} galleryOptions={galleryOptions} view={view} selectedStage={selectedStage} superAdmin={session.role === "SUPER_ADMIN"} />
    <section className={styles.workspace}><article className={styles.panel}><h2>{view === "auction-live" ? "팀별 잔여 포인트·로스터" : "팀·경매"}</h2>{destruction.teams.length ? destruction.teams.map((team) => <div className={styles.row} key={team.id}><span>{team.name}{view === "auction-live" ? ` · ${destruction.participants.filter((participant) => participant.teamId === team.id).map((participant) => playerLabels[participant.playerId] ?? "알 수 없는 선수").join(", ")}` : ""}</span><strong>{team.remainingAuctionPoints}/{team.initialAuctionPoints}P</strong></div>) : <p>팀이 아직 확정되지 않았습니다.</p>}</article><article className={styles.panel}><h2>{view === "auction-live" ? "경매 대기 현황" : "대진·MVP"}</h2>{view === "auction-live" ? <><div className={styles.row}><span>추첨 대기</span><strong>{destruction.participants.filter((participant) => participant.auctionStatus === "PENDING" || participant.auctionStatus === "HOLD").length}</strong></div><div className={styles.row}><span>낙찰 완료</span><strong>{destruction.participants.filter((participant) => participant.auctionStatus === "SOLD").length}</strong></div></> : <><div className={styles.row}><span>예선 경기</span><strong>{destruction.preliminaryFixtures.length}</strong></div><div className={styles.row}><span>본선 경기</span><strong>{destruction.tournamentBracket?.fixtures.length ?? 0}</strong></div><div className={styles.row}><span>MVP 투표</span><strong>{destruction.mvpBallots.filter((ballot) => ballot.finalizedPlayerId).length}</strong></div><div className={styles.row}><span>교체 기록</span><strong>{destruction.replacements.length}</strong></div></>}</article></section>
  </main>;
}
