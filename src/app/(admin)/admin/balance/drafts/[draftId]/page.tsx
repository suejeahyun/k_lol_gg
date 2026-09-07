import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Scale } from "lucide-react";
import { notFound } from "next/navigation";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { TEAM_BALANCE_TEAMS } from "@/modules/team-tools";
import { loadRuntimeTeamBalance } from "@/modules/team-tools/infrastructure/runtime-team-balance";

import styles from "@/app/(public)/(tools)/tools/team-tools.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "팀 밸런스 초안 검수", robots: { index: false, follow: false } };

const teamLabel = { BLUE: "블루", RED: "레드" } as const;
const positionLabel = { TOP: "탑", JGL: "정글", MID: "미드", ADC: "원딜", SUP: "서포터" } as const;

export default async function AdminTeamBalanceDraftPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  const session = await requirePageRole("ADMIN", `/admin/balance/drafts/${draftId}`);
  const result = await loadRuntimeTeamBalance((service) => service.getDraft({ actorUserAccountId: session.userId, authorization: "ADMIN" }, draftId));
  if (result.state === "ready" && !result.data) notFound();
  const draft = result.state === "ready" ? result.data : null;

  return <main className={`page-wrap ${styles.page}`}>
    <Link className={styles.backLink} href="/admin/balance/drafts"><ArrowLeft size={16} aria-hidden="true" /> 전체 초안 목록</Link>
    {draft ? <>
      <section className={styles.draftHeader}><div><span>READ ONLY · ROUND {draft.evaluationRound}</span><h1>{draft.title}</h1><p>소유 계정 {draft.ownerUserAccountId} · revision {draft.revision} · 통계 generation {draft.ratingGeneration ?? "중립값"}</p></div><strong data-status={draft.status}>{draft.status}</strong></section>
      <section className={styles.candidateSection} aria-labelledby="admin-candidates-title"><div className={styles.heading}><div><span>CALCULATION EVIDENCE</span><h2 id="admin-candidates-title">평가 후보와 배치 근거</h2></div><p>관리자 화면은 원본을 변경하지 않습니다.</p></div>
        <div className={styles.candidateGrid}>{draft.candidates.map((candidate) => <article key={candidate.id} data-selected={draft.selectedCandidateSignature === candidate.signature}><header><strong>{candidate.source === "AUTO" ? `자동 후보 ${candidate.rank}` : "수동 후보"}</strong><span>총 페널티 {candidate.score.totalPenalty.toLocaleString()}</span></header><div className={styles.compactTeams}>{TEAM_BALANCE_TEAMS.map((team) => <div key={team}><b>{teamLabel[team]}</b>{candidate.assignments.filter((entry) => entry.team === team).map((entry) => <span key={`${entry.playerId}-${entry.position}`}><small>{positionLabel[entry.position]}</small>{draft.participants.find((participant) => participant.playerId === entry.playerId)?.displayName ?? entry.playerId}</span>)}</div>)}</div><p>팀 차이 {candidate.score.teamStrength.difference} · 라인 차이 {candidate.score.positionDifferenceTotal}</p></article>)}</div>
      </section>
    </> : <section className={styles.emptyState} role={result.state === "error" ? "alert" : "status"}><Scale aria-hidden="true" /><h1>팀 초안을 불러올 수 없습니다.</h1><p>데이터베이스 연결을 확인한 뒤 다시 시도해 주세요.</p></section>}
  </main>;
}
