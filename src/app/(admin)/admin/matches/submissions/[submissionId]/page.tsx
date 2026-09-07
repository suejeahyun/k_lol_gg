import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { loadRuntimeMatchData } from "@/modules/matches/infrastructure/runtime-match-data";

import { SubmissionReview } from "./submission-review";
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
  const result = await loadRuntimeMatchData(async (service) => {
    const submission = await service.getAdminSubmission(submissionId);
    return [
      submission,
      await service.getAdminEditorCatalog(reviewedPlayerIds(submission?.reviewedResult)),
    ] as const;
  });
  if (result.state === "ready" && !result.data[0]) notFound();
  const submission = result.state === "ready" ? result.data[0] : null;
  return <main className={styles.page}><Link href="/admin/matches?view=submissions"><ArrowLeft size={16} aria-hidden="true" /> 결과 접수 목록</Link>{result.state !== "ready" || !submission ? <section className={styles.state} role={result.state === "error" ? "alert" : "status"}><h1>접수 데이터를 불러오지 못했습니다.</h1></section> : <><section className={styles.hero}><div><p>{submission.publicCode} · {submission.status}</p><h1>{submission.title}</h1><p>{submission.organizer} · {submission.seriesNumber}회 · {submission.playedOn} · 시즌 {submission.seasonName ?? "미지정"}</p></div></section><SubmissionReview submission={submission} catalog={result.data[1]} /></>}</main>;
}
