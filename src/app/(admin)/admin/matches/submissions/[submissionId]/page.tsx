import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@/components/theme/theme-icons";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeMatchData } from "@/modules/matches/infrastructure/runtime-match-data";
import { validTeamBalanceSubmissionAssignments } from "@/modules/matches/infrastructure/postgres-match-repository";
import { loadRuntimeTeamBalance } from "@/modules/team-tools/infrastructure/runtime-team-balance";

import { SubmissionReview, type LinkedReviewTeam } from "./submission-review";
import { SUBMISSION_STATUS_LABEL } from "../../submission-labels";
import styles from "../../matches-admin.module.css";

export const dynamic = "force-dynamic";

function reviewedPlayerIds(value: unknown) {
  if (!value || typeof value !== "object" || !("games" in value) || !Array.isArray(value.games)) return [];
  return value.games.flatMap((game) => {
    if (!game || typeof game !== "object" || !("participants" in game) || !Array.isArray(game.participants)) return [];
    return game.participants.flatMap((participant: unknown) =>
      participant && typeof participant === "object" && "playerId" in participant && typeof participant.playerId === "string"
        ? [participant.playerId]
        : []);
  });
}

export default async function SubmissionDetailPage({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const session = await requirePageRole("ADMIN", `/admin/matches/submissions/${submissionId}`);
  const result = await loadRuntimeMatchData(async (service) => {
    const submission = await service.getAdminSubmission(submissionId);
    const teamResult = submission?.teamBalanceDraftId && submission.status === "PENDING_REVIEW" && !submission.reviewedResult
      ? await loadRuntimeTeamBalance((teamService) => teamService.getDraft({ actorUserAccountId: session.userId, authorization: "ADMIN" }, submission.teamBalanceDraftId!))
      : { state: "ready" as const, data: null };
    const draft = teamResult.state === "ready" ? teamResult.data : null;
    const selected = draft && draft.status !== "ARCHIVED" && draft.ownerUserAccountId === submission?.ownerUserAccountId
      ? draft.candidates.find((candidate) => candidate.signature === draft.selectedCandidateSignature && candidate.source === draft.selectedCandidateSource && candidate.evaluationRound === draft.evaluationRound)
      : null;
    const assignments = draft && selected && validTeamBalanceSubmissionAssignments(selected.assignments, draft.participants.map((participant) => participant.playerId))
      ? selected.assignments : [];
    const catalog = await service.getAdminEditorCatalog([...reviewedPlayerIds(submission?.reviewedResult), ...assignments.map((assignment) => assignment.playerId)]);
    const linkedTeam: LinkedReviewTeam | null = draft && assignments.length === 10 && assignments.every((assignment) => catalog.players.some((player) => player.id === assignment.playerId && player.status === "ACTIVE"))
      ? { draftId: draft.id, title: draft.title, revision: draft.revision, assignments: assignments.map(({ playerId, team, position }) => ({ playerId, team, position })) }
      : null;
    return [submission, catalog, linkedTeam] as const;
  });
  if (result.state === "ready" && !result.data[0]) notFound();
  const submission = result.state === "ready" ? result.data[0] : null;
  return <main className={styles.page}><Link href="/admin/matches?view=submissions"><ArrowLeft size={16} aria-hidden="true" /> 결과 접수 목록</Link>{result.state !== "ready" || !submission ? <section className={styles.state} role={result.state === "error" ? "alert" : "status"}><h1>접수 데이터를 불러오지 못했습니다.</h1></section> : <><section className={styles.hero}><div><p>{submission.publicCode} · {SUBMISSION_STATUS_LABEL[submission.status]}</p><h1>{submission.title}</h1><p>{submission.organizer} · {submission.seriesNumber}회 · {submission.playedOn} · 시즌 {submission.seasonName ?? "미지정"}</p></div></section><SubmissionReview submission={submission} catalog={result.data[1]} linkedTeam={result.data[2]} /></>}</main>;
}
