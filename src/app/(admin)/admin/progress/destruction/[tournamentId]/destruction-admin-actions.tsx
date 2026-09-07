"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { CompetitionPlayerOption } from "@/modules/competitions/core";
import type { DestructionAggregate } from "@/modules/competitions/destruction";
import { BoundedPicker } from "../../../matches/bounded-picker";
import styles from "../../event/event-admin.module.css";

const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
const applicationStatusLabel = { APPLIED: "신청", CONFIRMED: "확정", RESERVE: "예비", REJECTED: "거절", CANCELLED: "취소" } as const;

type ResultFixture = Readonly<{
  id: string;
  label: string;
  teamAId: string;
  teamBId: string;
  teamAScore: number | null;
  teamBScore: number | null;
  completed: boolean;
}>;

export function DestructionAdminActions({ destruction, playerOptions, playerLabels }: Readonly<{
  destruction: DestructionAggregate;
  playerOptions: readonly CompetitionPlayerOption[];
  playerLabels: Readonly<Record<string, string>>;
}>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [incomingPlayerId, setIncomingPlayerId] = useState("");
  const usedPlayerIds = useMemo(() => new Set(destruction.participants.map((item) => item.playerId)), [destruction.participants]);
  const teamLabels = useMemo(() => new Map(destruction.teams.map((team) => [team.id, team.name])), [destruction.teams]);
  const playerLabel = (playerId: string) => playerLabels[playerId] ?? "알 수 없는 선수";
  const participantLabel = (participantId: string) => {
    const participant = destruction.participants.find((item) => item.id === participantId);
    return participant ? `${playerLabel(participant.playerId)} · ${participant.position}` : "알 수 없는 선수";
  };
  const teamLabel = (teamId: string) => teamLabels.get(teamId) ?? "알 수 없는 팀";
  const drawn = destruction.participants.find((item) => item.auctionStatus === "DRAWN") ?? null;
  const preliminaryFixtures: ResultFixture[] = destruction.preliminaryFixtures.map((fixture) => ({
    id: fixture.id,
    label: `${fixture.groupKey ?? "예선"} · ${teamLabel(fixture.teamAId)} vs ${teamLabel(fixture.teamBId)}`,
    teamAId: fixture.teamAId,
    teamBId: fixture.teamBId,
    teamAScore: fixture.teamAScore,
    teamBScore: fixture.teamBScore,
    completed: fixture.status === "COMPLETED",
  }));
  const tournamentFixtures: ResultFixture[] = (destruction.tournamentBracket?.fixtures ?? []).flatMap((fixture) =>
    fixture.teamAId && fixture.teamBId ? [{
      id: fixture.id,
      label: `${fixture.stage} · ${teamLabel(fixture.teamAId)} vs ${teamLabel(fixture.teamBId)}`,
      teamAId: fixture.teamAId,
      teamBId: fixture.teamBId,
      teamAScore: fixture.result?.teamAScore ?? null,
      teamBScore: fixture.result?.teamBScore ?? null,
      completed: Boolean(fixture.result),
    }] : []);

  async function command(type: string, payload: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/competitions/destruction/${destruction.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "If-Match": `"${destruction.revision}"`, "Idempotency-Key": `destruction-${type.toLocaleLowerCase()}-${crypto.randomUUID()}` }, body: JSON.stringify({ type, payload }) });
      const body = await response.json() as { detail?: string };
      if (!response.ok) throw new Error(body.detail ?? "멸망전 작업을 완료하지 못했습니다.");
      setMessage("작업을 반영했습니다."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "멸망전 작업을 완료하지 못했습니다."); }
    finally { setBusy(false); }
  }

  function formPayload(event: FormEvent<HTMLFormElement>) { event.preventDefault(); return new FormData(event.currentTarget); }
  function confirmTeams(event: FormEvent<HTMLFormElement>) {
    const data = formPayload(event);
    const names = data.getAll("teamName").map(String);
    const participantIds = data.getAll("captainParticipantId").map(String);
    const baselineValues = data.getAll("baselineValue").map(Number);
    if (new Set(names.map((name) => name.normalize("NFKC").trim())).size !== names.length || new Set(participantIds).size !== participantIds.length) {
      setMessage("팀 이름과 주장은 서로 중복되지 않게 선택해 주세요."); return;
    }
    const captains = names.map((name, index) => ({ teamId: crypto.randomUUID(), name, participantId: participantIds[index], baselineValue: baselineValues[index] }));
    void command("CONFIRM_TEAMS", { seed: data.get("seed"), captains });
  }

  const status = destruction.lifecycle.status;
  return <section className={styles.actions} aria-labelledby="destruction-actions-title"><h2 id="destruction-actions-title">현재 단계 작업</h2><div className={styles.actionsGrid}>
    {status === "PLANNED" ? <button className={styles.primary} disabled={busy} onClick={() => void command("START_RECRUITMENT", {})}>모집 시작</button> : null}
    {status === "RECRUITING" ? <><form className={styles.form} onSubmit={(event) => { const data = formPayload(event); void command("SET_APPLICATION_STATUS", { applicationId: data.get("applicationId"), status: data.get("status") }); }}><strong>신청 심사</strong><label>신청 선수<select name="applicationId" required defaultValue=""><option value="" disabled>선수를 선택해 주세요</option>{destruction.applications.map((application) => <option key={application.id} value={application.id}>{playerLabel(application.playerId)} · {application.position} · {applicationStatusLabel[application.status]}</option>)}</select></label><label>심사 결과<select name="status"><option value="CONFIRMED">참가 확정</option><option value="RESERVE">예비 선수</option><option value="REJECTED">신청 거절</option></select></label><button disabled={busy || destruction.applications.length === 0}>반영</button></form><button className={styles.primary} disabled={busy} onClick={() => void command("CLOSE_RECRUITMENT", {})}>팀별 정확히 5인 모집 마감</button></> : null}
    {status === "TEAM_BUILDING" ? <><form className={styles.form} onSubmit={confirmTeams}><strong>주장·경매 포인트 확정</strong><label>대진·추첨 시드<input name="seed" minLength={8} maxLength={128} placeholder="운영진이 정한 8자 이상 문구" required /></label>{Array.from({ length: destruction.configuration.teamCount }, (_, index) => <fieldset key={index}><legend>{index + 1}팀</legend><label>팀 이름<input name="teamName" defaultValue={`${index + 1}팀`} minLength={1} maxLength={50} required /></label><label>주장<select name="captainParticipantId" defaultValue="" required><option value="" disabled>선수를 선택해 주세요</option>{destruction.participants.map((participant) => <option key={participant.id} value={participant.id}>{participantLabel(participant.id)}</option>)}</select></label><label>기준 가치<input name="baselineValue" type="number" min={0} max={1000000} defaultValue={50} required /></label></fieldset>)}<button disabled={busy || destruction.participants.length === 0}>팀 확정</button></form>{destruction.teams.length ? <button className={styles.primary} disabled={busy} onClick={() => void command("START_AUCTION", {})}>seeded 경매 시작</button> : null}</> : null}
    {status === "AUCTION" ? <><article className={styles.form}><strong>현재 추첨 선수</strong><p>{drawn ? participantLabel(drawn.id) : "추첨 대기 중"}</p><button className={styles.primary} disabled={busy || Boolean(drawn)} onClick={() => void command("DRAW_AUCTION", {})}>다음 선수 추첨</button>{drawn ? <button disabled={busy} onClick={() => void command("HOLD_AUCTION", { participantId: drawn.id })}>이번 선수 보류</button> : null}</article>{drawn ? <form className={styles.form} onSubmit={(event) => { const data = formPayload(event); void command("SELL_AUCTION", { participantId: drawn.id, teamId: data.get("teamId"), purchasePoints: Number(data.get("purchasePoints")) }); }}><strong>{participantLabel(drawn.id)} 낙찰</strong><label>낙찰 팀<select name="teamId">{destruction.teams.map((team) => <option key={team.id} value={team.id}>{team.name} · 잔여 {team.remainingAuctionPoints}P</option>)}</select></label><label>낙찰 포인트<input name="purchasePoints" type="number" min={1} max={Math.max(...destruction.teams.map((team) => team.remainingAuctionPoints), 1)} required /></label><button disabled={busy}>낙찰 확정</button></form> : null}<button className={styles.primary} disabled={busy} onClick={() => void command("PUBLISH_PRELIMINARY", {})}>예선 대진 공개</button></> : null}
    {status === "PRELIMINARY" ? <><ResultForms busy={busy} fixtures={preliminaryFixtures} teamLabel={teamLabel} record="RECORD_PRELIMINARY_RESULT" correct="CORRECT_PRELIMINARY_RESULT" command={command} /><button className={styles.primary} disabled={busy} onClick={() => void command("PUBLISH_TOURNAMENT", {})}>상위 4팀 본선 공개</button></> : null}
    {status === "TOURNAMENT" ? <><ResultForms busy={busy} fixtures={tournamentFixtures} teamLabel={teamLabel} record="RECORD_TOURNAMENT_RESULT" correct="CORRECT_TOURNAMENT_RESULT" command={command} /><form className={styles.form} onSubmit={(event) => { const data = formPayload(event); if (!incomingPlayerId) { setMessage("새 선수를 검색해 선택해 주세요."); return; } void command("REPLACE_PARTICIPANT", { replacementId: crypto.randomUUID(), participantId: data.get("participantId"), incomingPlayerId, incomingPosition: data.get("incomingPosition"), reason: data.get("reason") }); }}><strong>선수 교체 · SUPER</strong><label>교체 대상<select name="participantId">{destruction.participants.filter((participant) => participant.teamId).map((participant) => <option key={participant.id} value={participant.id}>{teamLabel(participant.teamId!)} · {participantLabel(participant.id)}</option>)}</select></label><label>새 선수 검색<BoundedPicker ariaLabel="교체 투입 선수" value={incomingPlayerId} options={playerOptions} disabledValues={usedPlayerIds} placeholder="닉네임 또는 태그 검색" remoteEndpoint="/api/admin/matches/editor-options/players" onChange={setIncomingPlayerId} /></label><label>포지션<select name="incomingPosition">{positions.map((lane) => <option key={lane}>{lane}</option>)}</select></label><label>사유<input name="reason" minLength={2} maxLength={500} required /></label><button disabled={busy || !incomingPlayerId}>교체</button></form><MvpAdminForm busy={busy} destruction={destruction} playerLabel={playerLabel} fixtureLabel={(fixtureId) => [...preliminaryFixtures, ...tournamentFixtures].find((fixture) => fixture.id === fixtureId)?.label ?? "알 수 없는 경기"} command={command} /><button className={styles.primary} disabled={busy || !destruction.tournamentBracket?.championTeamId} onClick={() => void command("COMPLETE_DESTRUCTION", {})}>전체 경기 확정·완료</button></> : null}
    {status !== "COMPLETED" && status !== "CANCELLED" ? <form className={styles.form} onSubmit={(event) => { const data = formPayload(event); void command("CANCEL_DESTRUCTION", { reason: data.get("reason") }); }}><strong>대회 취소</strong><label>취소 사유<input name="reason" minLength={2} maxLength={300} required /></label><button className={styles.danger} disabled={busy}>취소</button></form> : null}
    {status === "CANCELLED" ? <button className={styles.primary} disabled={busy} onClick={() => void command("RESTORE_DESTRUCTION", {})}>이전 단계 복구 · SUPER</button> : null}
  </div><p role="status" aria-live="polite">{busy ? "처리 중…" : message}</p></section>;
}

function ResultForms({ busy, fixtures, teamLabel, record, correct, command }: Readonly<{
  busy: boolean;
  fixtures: readonly ResultFixture[];
  teamLabel: (teamId: string) => string;
  record: "RECORD_PRELIMINARY_RESULT" | "RECORD_TOURNAMENT_RESULT";
  correct: "CORRECT_PRELIMINARY_RESULT" | "CORRECT_TOURNAMENT_RESULT";
  command: (type: string, payload: Record<string, unknown>) => Promise<void>;
}>) {
  return <>{fixtures.map((fixture) => <form className={styles.form} key={fixture.id} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void command(fixture.completed ? correct : record, { fixtureId: fixture.id, teamAScore: Number(data.get("teamAScore")), teamBScore: Number(data.get("teamBScore")), winnerTeamId: data.get("winnerTeamId") }); }}><strong>{fixture.label} · {fixture.completed ? "결과 정정 · SUPER" : "결과 입력"}</strong><label>{teamLabel(fixture.teamAId)} 점수<input name="teamAScore" type="number" min={0} max={9} defaultValue={fixture.teamAScore ?? 0} required /></label><label>{teamLabel(fixture.teamBId)} 점수<input name="teamBScore" type="number" min={0} max={9} defaultValue={fixture.teamBScore ?? 0} required /></label><label>승리 팀<select name="winnerTeamId" defaultValue={fixture.teamAId}><option value={fixture.teamAId}>{teamLabel(fixture.teamAId)}</option><option value={fixture.teamBId}>{teamLabel(fixture.teamBId)}</option></select></label><button disabled={busy}>{fixture.completed ? "결과 정정" : "결과 저장"}</button></form>)}</>;
}

function MvpAdminForm({ busy, destruction, playerLabel, fixtureLabel, command }: Readonly<{
  busy: boolean;
  destruction: DestructionAggregate;
  playerLabel: (playerId: string) => string;
  fixtureLabel: (fixtureId: string) => string;
  command: (type: string, payload: Record<string, unknown>) => Promise<void>;
}>) {
  const [fixtureId, setFixtureId] = useState(destruction.mvpBallots[0]?.fixtureId ?? "");
  const ballot = destruction.mvpBallots.find((item) => item.fixtureId === fixtureId) ?? destruction.mvpBallots[0];
  return <form className={styles.form} onSubmit={(event) => { event.preventDefault(); const playerId = new FormData(event.currentTarget).get("playerId"); if (!ballot) return; void command(playerId ? "ASSIGN_MVP" : "RESET_MVP", playerId ? { fixtureId: ballot.fixtureId, playerId } : { fixtureId: ballot.fixtureId }); }}><strong>MVP 재투표·직접 지정 · SUPER</strong><label>대상 경기<select value={ballot?.fixtureId ?? ""} onChange={(event) => setFixtureId(event.target.value)}>{destruction.mvpBallots.map((item) => <option key={item.fixtureId} value={item.fixtureId}>{fixtureLabel(item.fixtureId)}</option>)}</select></label><label>직접 지정 선수<select key={ballot?.fixtureId ?? "empty"} name="playerId" defaultValue=""><option value="">선택하지 않고 재투표</option>{ballot?.participantPlayerIds.map((playerId) => <option key={playerId} value={playerId}>{playerLabel(playerId)}</option>)}</select></label><button disabled={busy || !ballot}>MVP 처리</button></form>;
}
