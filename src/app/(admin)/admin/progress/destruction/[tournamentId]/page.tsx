import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Gavel } from "lucide-react";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { isDestructionUuid } from "@/modules/competitions/destruction";
import { getRuntimeDestruction } from "@/modules/competitions/destruction/runtime-destruction";

import styles from "../../event/event-admin.module.css";
import { DestructionAdminActions } from "./destruction-admin-actions";

export const dynamic = "force-dynamic";
const stages = ["PLANNED", "RECRUITING", "TEAM_BUILDING", "AUCTION", "PRELIMINARY", "TOURNAMENT", "COMPLETED"] as const;

export default async function AdminDestructionDetailPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = await params;
  await requirePageRole("ADMIN", `/admin/progress/destruction/${tournamentId}`);
  if (!isDestructionUuid(tournamentId)) notFound();
  const runtime = getRuntimeDestruction();
  if (!runtime) return <main className={styles.page}><section className={styles.state} role="status"><h1>멸망전 저장소를 준비하고 있습니다.</h1><p>0013 영속 어댑터 연결 뒤 이 화면에서 운영할 수 있습니다.</p></section></main>;
  let workspace;
  try { workspace = await runtime.repository.getAdminWorkspace(tournamentId); }
  catch { return <main className={styles.page}><section className={styles.state} role="alert"><h1>멸망전을 불러오지 못했습니다.</h1><p>잠시 후 다시 시도해 주세요.</p></section></main>; }
  if (!workspace) notFound();
  const { destruction, playerOptions, playerLabels } = workspace;
  const teamLabels = new Map(destruction.teams.map((team) => [team.id, team.name]));
  return <main className={styles.page}>
    <Link href="/admin/progress/destruction"><ArrowLeft aria-hidden="true" /> 멸망전 목록</Link>
    <header className={styles.hero}><div><span><Gavel aria-hidden="true" /> {destruction.configuration.preliminaryFormat}</span><h1>{destruction.title}</h1><p>{destruction.configuration.teamCount}팀 · 포지션별 5인 · revision {destruction.revision}</p></div><Link href={`/competitions/destruction/${destruction.id}`}>공개 화면</Link></header>
    <ol className={styles.stages} aria-label="멸망전 진행 단계">{stages.map((stage) => <li className={destruction.lifecycle.status === stage ? styles.current : ""} key={stage}>{stage}</li>)}</ol>
    <section className={styles.summary}><article><span>현재 단계</span><strong>{destruction.lifecycle.status}</strong></article><article><span>참가자</span><strong>{destruction.participants.length}/{destruction.configuration.teamCount * 5}</strong></article><article><span>팀</span><strong>{destruction.teams.length}/{destruction.configuration.teamCount}</strong></article><article><span>우승</span><strong>{destruction.tournamentBracket?.championTeamId ? teamLabels.get(destruction.tournamentBracket.championTeamId) ?? "알 수 없는 팀" : "미정"}</strong></article></section>
    <section className={styles.workspace}><article className={styles.panel}><h2>팀·경매</h2>{destruction.teams.length ? destruction.teams.map((team) => <div className={styles.row} key={team.id}><span>{team.name}</span><strong>{team.remainingAuctionPoints}/{team.initialAuctionPoints}P</strong></div>) : <p>팀이 아직 확정되지 않았습니다.</p>}</article><article className={styles.panel}><h2>대진·MVP</h2><div className={styles.row}><span>예선 경기</span><strong>{destruction.preliminaryFixtures.length}</strong></div><div className={styles.row}><span>본선 경기</span><strong>{destruction.tournamentBracket?.fixtures.length ?? 0}</strong></div><div className={styles.row}><span>MVP 투표</span><strong>{destruction.mvpBallots.filter((ballot) => ballot.finalizedPlayerId).length}</strong></div><div className={styles.row}><span>교체 기록</span><strong>{destruction.replacements.length}</strong></div></article></section>
    <DestructionAdminActions destruction={destruction} playerOptions={playerOptions} playerLabels={playerLabels} />
  </main>;
}
