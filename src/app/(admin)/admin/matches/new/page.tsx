import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { requirePageRole } from "@/modules/auth/infrastructure/server-authorization";
import { loadRuntimeMatchData } from "@/modules/matches/infrastructure/runtime-match-data";
import { loadRuntimeTeamBalance } from "@/modules/team-tools/infrastructure/runtime-team-balance";

import { MatchEditor } from "../match-editor";
import styles from "../matches-admin.module.css";
import { AdminImportPanel } from "./admin-import-panel";

export const dynamic = "force-dynamic";

function currentKstDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function requestedDraftId(input: Record<string, string | string[] | undefined>) {
  if (Object.keys(input).some((key) => key !== "teamBalanceDraftId")) return undefined;
  const value = input.teamBalanceDraftId;
  if (value === undefined) return null;
  return typeof value === "string" && uuidPattern.test(value)
    ? value.toLocaleLowerCase("en-US")
    : undefined;
}

export default async function NewMatchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePageRole("ADMIN", "/admin/matches/new");
  const teamBalanceDraftId = requestedDraftId(await searchParams);
  if (teamBalanceDraftId === undefined) notFound();
  const draftResult = teamBalanceDraftId
    ? await loadRuntimeTeamBalance((service) => service.getDraft({ actorUserAccountId: session.userId, authorization: "ADMIN" }, teamBalanceDraftId))
    : { state: "ready" as const, data: null };
  if (teamBalanceDraftId && draftResult.state !== "ready") {
    return <main className={styles.page}><Link href="/admin/balance/drafts"><ArrowLeft size={16} aria-hidden="true" /> 팀 초안 목록</Link><section className={styles.state} role="alert"><h1>팀 초안을 불러오지 못했습니다.</h1><p>빈 경기로 전환하지 않았습니다. 초안 상태를 확인한 뒤 다시 시도해 주세요.</p></section></main>;
  }
  if (teamBalanceDraftId && (!draftResult.data || draftResult.data.status === "ARCHIVED")) notFound();
  const selectedCandidate = draftResult.state === "ready" && draftResult.data?.selectedCandidateSignature
    ? draftResult.data.candidates.find((candidate) => candidate.signature === draftResult.data?.selectedCandidateSignature) ?? null
    : null;
  if (teamBalanceDraftId && !selectedCandidate) {
    return <main className={styles.page}><Link href={`/admin/balance/drafts/${teamBalanceDraftId}`}><ArrowLeft size={16} aria-hidden="true" /> 팀 초안으로</Link><section className={styles.state} role="alert"><h1>선택된 팀 배치를 확인할 수 없습니다.</h1><p>추천 팀 배치를 다시 적용한 뒤 경기 등록을 시작해 주세요.</p></section></main>;
  }
  const result = await loadRuntimeMatchData((service) => service.getAdminEditorCatalog(
    draftResult.data?.participants.map((participant) => participant.playerId) ?? [],
  ));
  const teamBalanceSource = draftResult.data && selectedCandidate ? {
    teamBalanceDraftId: draftResult.data.id,
    teamBalanceDraftRevision: draftResult.data.revision,
    teamBalanceEvaluationRound: draftResult.data.evaluationRound,
    teamBalanceCandidateSignature: selectedCandidate.signature,
  } : null;
  const initialGames = selectedCandidate
    ? [{
        gameNumber: 1,
        durationSeconds: 1_800,
        winnerTeam: "BLUE" as const,
        participants: selectedCandidate.assignments.map((assignment) => ({
          playerId: assignment.playerId,
          championKey: "",
          team: assignment.team,
          position: assignment.position,
          kills: 0,
          deaths: 0,
          assists: 0,
        })),
      }]
    : [];
  return <main className={styles.page}>
    <Link href="/admin/matches"><ArrowLeft size={16} aria-hidden="true" /> 경기 목록</Link>
    <section className={styles.hero}><div><p>NEW DRAFT</p><h1>새 경기 초안</h1><p>{selectedCandidate && draftResult.state === "ready" && draftResult.data ? `팀 초안 '${draftResult.data.title}'의 선택 배치를 불러왔습니다. 챔피언과 경기 결과를 입력해 주세요.` : "시즌·플레이어·챔피언을 선택해 구조화된 경기 기록을 만듭니다."}</p></div></section>
    {result.state === "ready"
      ? <><AdminImportPanel seasons={result.data.seasons} playedOn={currentKstDate()} /><MatchEditor
          initialState={{ id: null, status: "DRAFT", revision: 0 }}
          initialBody={{
            seasonId: "",
            title: draftResult.state === "ready" && draftResult.data ? draftResult.data.title : "",
            playedOn: currentKstDate(),
            startedAt: null,
            games: initialGames,
          }}
          catalog={result.data}
          teamBalanceSource={teamBalanceSource}
        /></>
      : <section className={styles.state} role="alert">편집에 필요한 시즌·플레이어·챔피언 목록을 불러오지 못했습니다.</section>}
  </main>;
}
