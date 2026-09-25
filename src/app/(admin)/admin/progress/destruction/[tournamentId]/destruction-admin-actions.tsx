"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { CompetitionPlayerOption } from "@/modules/competitions/core/display-projection";
import { competitionPositionLabel } from "@/modules/competitions/core/display-projection";
import { COMPETITION_POSITIONS } from "@/modules/competitions/core/roster";
import type { DestructionAggregate } from "@/modules/competitions/destruction/state";
import { auctionTeamEligibility } from "@/modules/competitions/destruction/auction";
import { calculateCaptainAuctionPoints } from "@/modules/competitions/destruction/captain-points";
import { buildPreliminaryFixtures } from "@/modules/competitions/destruction/fixtures";
import { rebuildDestructionPreliminaryProjection } from "@/modules/competitions/destruction/standings";
import { APPLICATION_STATUS_LABEL, destructionCorrectionImpact, destructionReadiness, destructionRecruitment, DESTRUCTION_STATUS_LABEL } from "@/modules/competitions/destruction/workflow";
import { DestructionLiveStatus } from "@/components/competitions/destruction/live-status";
import { useDestructionMutation } from "@/components/competitions/destruction/use-destruction-mutation";
import { BoundedPicker } from "../../../matches/bounded-picker";
import styles from "@/components/competitions/destruction/workspace.module.css";
import { DESTRUCTION_SCHEDULE_LABELS, EMPTY_DESTRUCTION_SCHEDULE, validateDestructionSchedule } from "@/modules/competitions/destruction/schedule";

import { aramAuctionRating } from "@/modules/competitions/destruction/aram-rating";
import { AuctionReveal } from "@/components/competitions/destruction/auction-reveal";
import { destructionAuctionCard } from "@/modules/competitions/destruction/auction-presentation";

type Command = (type: string, payload: Record<string, unknown>) => Promise<boolean | void>;
type Context = { destruction: DestructionAggregate; busy: boolean; command: Command; playerLabel: (id: string) => string; teamLabel: (id: string) => string; superAdmin: boolean };
function formData(event: FormEvent<HTMLFormElement>) { event.preventDefault(); return new FormData(event.currentTarget); }

export function DestructionAdminActions({ destruction, playerOptions, playerLabels, galleryOptions, view = "default", superAdmin = false }: Readonly<{
  destruction: DestructionAggregate;
  playerOptions: readonly CompetitionPlayerOption[];
  playerLabels: Readonly<Record<string, string>>;
  galleryOptions: readonly Readonly<{ id: string; title: string }>[];
  view?: "default" | "auction-live";
  superAdmin?: boolean;
}>) {
  const mutation = useDestructionMutation(destruction.revision);
  const status = destruction.lifecycle.status;
  const command: Command = (type, payload) => mutation.mutate(`/api/admin/competitions/destruction/${destruction.id}`, "PATCH", { type, payload });
  const playerLabel = (id: string) => playerLabels[id] ?? "알 수 없는 선수";
  const teamLabel = (id: string) => destruction.teams.find((team) => team.id === id)?.name ?? "알 수 없는 팀";
  const context: Context = { destruction, busy: mutation.busy || mutation.retryAvailable, command, playerLabel, teamLabel, superAdmin };
  return <section className={styles.workspace} aria-label="멸망전 운영 작업" aria-busy={mutation.busy}>
    <DestructionLiveStatus tournamentId={destruction.id} revision={destruction.revision} busy={mutation.busy || mutation.retryAvailable} enabled={status !== "COMPLETED"} />
    <div className={styles.notice} role="status" aria-live="polite">{mutation.busy ? "작업을 반영하고 최신 상태를 불러오고 있습니다…" : mutation.message || "현재 단계의 작업과 진행 조건을 확인해 주세요."}{mutation.retryAvailable ? <button type="button" onClick={() => void mutation.retry()}>요청 결과 다시 확인</button> : null}</div>
    <StageAdvance {...context} />
    {!["COMPLETED", "CANCELLED"].includes(status) && view !== "auction-live" ? <ScheduleForm {...context} /> : null}
    {status === "RECRUITING" ? <Recruitment {...context} /> : null}
    {status === "TEAM_BUILDING" && !destruction.teams.length ? <><AramRecords {...context} /><CaptainForm {...context} /></> : null}
    {status === "AUCTION" ? <Auction {...context} /> : null}
    {view !== "auction-live" && ["PRELIMINARY", "TOURNAMENT"].includes(status) ? <><ResultForms {...context} /><div className={styles.grid}><ReplacementForm {...context} playerOptions={playerOptions} /><MvpAdminForm {...context} /></div></> : null}
    {["TOURNAMENT", "COMPLETED"].includes(status) ? <section className={styles.panel}><h2>대회 갤러리</h2><form className={styles.form} onSubmit={(event) => { const galleryId = String(formData(event).get("galleryId") ?? ""); void command("SET_MEDIA_GALLERY", { galleryId: galleryId || null }); }}><label>게시된 갤러리<select name="galleryId" defaultValue={destruction.galleryId ?? ""}><option value="">연결하지 않음</option>{galleryOptions.map((gallery) => <option key={gallery.id} value={gallery.id}>{gallery.title}</option>)}</select></label><button disabled={context.busy}>갤러리 반영</button></form></section> : null}
    {!["COMPLETED", "CANCELLED"].includes(status) ? <details className={styles.panel}><summary>대회 취소</summary><p>신청과 진행이 중단됩니다. 기존 기록은 보존되며 SUPER_ADMIN이 취소 전 단계로 복구할 수 있습니다.</p><form className={styles.form} onSubmit={(event) => { const data = formData(event); void command("CANCEL_DESTRUCTION", { reason: data.get("reason") }); }}><label>취소 사유<input name="reason" minLength={2} maxLength={300} required /></label><label><span><input style={{ width: "auto", minHeight: "auto" }} type="checkbox" required /> 대회 진행 중단을 확인했습니다.</span></label><button className={styles.danger} disabled={context.busy}>대회 취소</button></form></details> : null}
    {destruction.replacements.length ? <details className={styles.panel}><summary>선수 교체 기록 · {destruction.replacements.length}건</summary>{destruction.replacements.map((entry) => <p key={entry.id}>{teamLabel(entry.teamId)} · {playerLabel(entry.outgoingPlayerId)} → {playerLabel(entry.incomingPlayerId)}<br /><small>{entry.effectiveAt} · {entry.reason}</small></p>)}</details> : null}
  </section>;
}

function ScheduleForm({ destruction, busy, command }: Context) {
  const [error, setError] = useState("");
  const schedule = destruction.schedule ?? EMPTY_DESTRUCTION_SCHEDULE;
  return <details className={styles.panel}><summary>대회 일정 관리 · 한국 시간</summary><p>예정 시간을 공개합니다. 입력한 시간이 되어도 모집 마감이나 단계 전환은 자동 실행되지 않습니다.</p><form className={styles.form} onSubmit={(event) => {
    const data = formData(event);
    try {
      const payload = Object.fromEntries(Object.keys(DESTRUCTION_SCHEDULE_LABELS).map((key) => { const value = String(data.get(key) ?? ""); return [key, value ? new Date(`${value}:00+09:00`).toISOString() : null]; }));
      validateDestructionSchedule(payload); setError(""); void command("SET_SCHEDULE", payload);
    } catch { setError("날짜를 확인하고 모집 마감 → 경매 → 예선 → 본선 순으로 입력해 주세요."); }
  }}><div className={styles.grid}>{Object.entries(DESTRUCTION_SCHEDULE_LABELS).map(([key, label]) => { const instant = schedule[key as keyof typeof schedule]; return <label key={key}>{label}<input type="datetime-local" name={key} defaultValue={instant ? new Date(Date.parse(instant) + 9 * 60 * 60 * 1000).toISOString().slice(0, 16) : ""} /></label>; })}</div><button disabled={busy}>일정 저장</button>{error ? <p role="alert">{error}</p> : null}</form></details>;
}

function StageAdvance({ destruction, busy, command, teamLabel, superAdmin }: Context) {
  const readiness = destructionReadiness(destruction);
  const [previewRevision, setPreviewRevision] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [fixtures, setFixtures] = useState<readonly { id: string; teamAId: string | null; teamBId: string | null }[]>([]);
  const restricted = readiness.action === "RESTORE_DESTRUCTION" && !superAdmin;
  function preview() {
    try {
      setFixtures(readiness.action === "PUBLISH_PRELIMINARY" ? buildPreliminaryFixtures(destruction) : readiness.action === "PUBLISH_TOURNAMENT" ? rebuildDestructionPreliminaryProjection({ competitionId: destruction.id, configuration: destruction.configuration, teamIds: destruction.teams.map((team) => team.id), fixtures: destruction.preliminaryFixtures }).tournamentBracket.fixtures : []);
      setPreviewRevision(destruction.revision); setError("");
    } catch { setError("대진을 생성할 수 없습니다. 팀 구성과 경기 결과를 확인해 주세요."); }
  }
  return <section className={styles.callout} aria-labelledby="next-step-title"><h2 id="next-step-title">{DESTRUCTION_STATUS_LABEL[destruction.lifecycle.status]} · 다음 작업</h2>
    {destruction.lifecycle.status === "CANCELLED" ? <p>취소 사유: {destruction.lifecycle.cancellationReason} · 복구 단계: {destruction.lifecycle.cancelledFrom ? DESTRUCTION_STATUS_LABEL[destruction.lifecycle.cancelledFrom] : "확인 필요"}</p> : null}
    {readiness.blockers.length ? <ul className={styles.blockers}>{readiness.blockers.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p>{readiness.action ? "다음 단계로 진행할 준비가 되었습니다." : "최종 결과와 기록이 확정되었습니다."}</p>}
    {restricted ? <p>복구는 SUPER_ADMIN 권한이 필요합니다.</p> : null}
    {readiness.action ? <button className={styles.primary} disabled={busy || !readiness.ready || restricted} onClick={preview}>{readiness.label} · 검토</button> : null}
    {error ? <p role="alert">{error}</p> : null}
    {previewRevision !== null ? <div className={styles.notice}><h3>실행 전 확인</h3><p>{readiness.label}{fixtures.length ? ` · ${fixtures.length}경기` : ""}</p>{fixtures.length ? <div className={styles.preview}>{fixtures.map((fixture) => <p key={fixture.id}>{fixture.teamAId ? teamLabel(fixture.teamAId) : "앞 경기 승자"} vs {fixture.teamBId ? teamLabel(fixture.teamBId) : "앞 경기 승자"}</p>)}</div> : null}{readiness.action === "COMPLETE_DESTRUCTION" ? <p>종료 후에는 경기 결과와 MVP를 변경할 수 없습니다.</p> : null}{previewRevision !== destruction.revision ? <p role="alert">대회 정보가 변경되었습니다. 다시 검토해 주세요.</p> : null}<div className={styles.buttons}><button className={styles.primary} disabled={busy || restricted || !readiness.ready || previewRevision !== destruction.revision} onClick={() => { if (readiness.action) void command(readiness.action, {}); setPreviewRevision(null); }}>확인·실행</button><button onClick={() => setPreviewRevision(null)}>닫기</button></div></div> : null}
  </section>;
}

function Recruitment({ destruction, busy, command, playerLabel }: Context) {
  const [query, setQuery] = useState("");
  const applications = destruction.applications.filter((entry) => playerLabel(entry.playerId).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className={styles.panel}><h2>참가 신청 심사</h2><div className={styles.lanes}>{destructionRecruitment(destruction).map((lane) => <article key={lane.position}><span>{competitionPositionLabel(lane.position)}</span><strong>{lane.confirmed}/{lane.required}</strong><small>확정 / 필요 인원</small><small>모집 {lane.applied}/{lane.limit}명</small></article>)}</div><label className={styles.form}>신청 선수 검색<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="닉네임·태그" /></label><div className={`${styles.tableWrap} ${styles.applications}`}><table><caption>신청 {destruction.applications.length}건 · 검색 결과 {applications.length}건</caption><thead><tr><th>선수</th><th>포지션</th><th>상태</th><th>심사</th></tr></thead><tbody>{applications.map((entry) => <tr key={entry.id}><th scope="row">{playerLabel(entry.playerId)}</th><td>{competitionPositionLabel(entry.position)}</td><td>{APPLICATION_STATUS_LABEL[entry.status]}</td><td>{entry.status === "CANCELLED" ? "재신청 대기" : <div className={styles.buttons}>{(["CONFIRMED", "RESERVE", "REJECTED"] as const).map((status) => <button key={status} disabled={busy || status === entry.status || (status === "CONFIRMED" && destruction.applications.filter((other) => other.position === entry.position && other.status === "CONFIRMED").length >= destruction.configuration.teamCount)} onClick={() => void command("SET_APPLICATION_STATUS", { applicationId: entry.id, status })}>{APPLICATION_STATUS_LABEL[status]}</button>)}</div>}</td></tr>)}</tbody></table></div>{!applications.length ? <p>조건에 맞는 신청이 없습니다.</p> : null}</section>;
}

function AramRecords({ destruction, busy, command, playerLabel }: Context) {
  const [running, setRunning] = useState<string | null>(null);
  const lastRevision = useRef(-1);
  const nextAt = useRef(0);
  const participant = destruction.participants.find((p) => p.id === running);
  useEffect(() => {
    if (!running || busy || participant?.aramRecord || lastRevision.current === destruction.revision) return;
    const timer = setTimeout(() => {
      lastRevision.current = destruction.revision;
      nextAt.current = Date.now() + 8_500;
      void command("SYNC_ARAM_RECORD", { participantId: running }).then((ok) => { if (!ok) setRunning(null); });
    }, Math.max(0, nextAt.current - Date.now()));
    return () => clearTimeout(timer);
  }, [running, busy, participant?.aramRecord, destruction.revision, command]);
  if (!["ARAM", "ARAM_MAYHEM"].includes(destruction.configuration.gameMode ?? "CLASSIC")) return null;
  const mayhem = destruction.configuration.gameMode === "ARAM_MAYHEM";
  return <section className={styles.panel}><h2>모드별 전적·일회성 임시 등급</h2><p>최근 최대 100판 · 5판씩 이어서 수집합니다. 5분 미만·조기 종료 경기는 제외합니다. 중단하거나 화면을 닫아도 저장된 수집 지점에서 이어갈 수 있습니다. 일반 칼바람과 증바람 전적은 합산하지 않습니다.</p>
    <p>보정 승률 = (승수 + 10) / (판수 + 20). 20판 미만은 승률에 관계없이 잠정 B등급입니다. S 60% 이상 · A 52.5% 이상 · B 47.5% 이상 · C 40% 이상 · D 40% 미만. 최소 입찰가는 S 300P / A 250P / B 200P / C 150P / D 100P. 대회 편성 전용이며 Riot 공식 티어·MMR이 아닙니다.</p>
    {mayhem ? <p role="status">증바람은 운영자가 해당 모드의 전적을 확인해 입력합니다. Riot 자동 조회와 구분하여 표시하며 확인 근거와 변경 이력을 보관합니다.</p> : <p>Riot 조회를 사용할 수 없는 경우에도 운영자 확인 입력을 이용할 수 있습니다. 출처는 공개 화면에 표시합니다.</p>}
    <div className={styles.grid}>{destruction.participants.map((p) => { const rating = p.aramRecord ? aramAuctionRating(p.aramRecord) : null; return <article className={styles.callout} key={p.id}><h3>{playerLabel(p.playerId)}</h3>{rating ? <p>{rating.games}판 {rating.wins}승 {rating.losses}패 · {rating.tier}등급 · 최소 {rating.minimumBid}P · 주장 {rating.captainPoints}P{rating.provisional ? " · 표본 부족" : ""}</p> : <p>평가 대기 · 수집 {p.aramCollection?.processed ?? 0}/{p.aramCollection?.matchIds.length ?? 100}판</p>}{p.aramRecord ? <p>{p.aramRecord.source === "RIOT" ? "Riot 조회" : "운영자 확인"} · {p.aramRecord.evidence} · {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }).format(new Date(p.aramRecord.fetchedAt))} 확인</p> : null}<div className={styles.buttons}>{!mayhem && !rating ? <button disabled={busy || Boolean(running && !participant?.aramRecord)} onClick={() => { lastRevision.current = -1; setRunning(p.id); }}>전적 수집 시작·계속</button> : null}{(p.aramCollection || p.aramRecord) ? <button disabled={busy || Boolean(running && !participant?.aramRecord)} onClick={() => void command("RESET_ARAM_RECORD", { participantId: p.id })}>전적 초기화</button> : null}</div>{!rating ? <VerifiedAramRecord key={p.id} participantId={p.id} mode={mayhem ? "ARAM_MAYHEM" : "ARAM"} busy={busy || Boolean(running && !participant?.aramRecord)} command={command} /> : null}</article>; })}</div>
    {running && !participant?.aramRecord ? <button onClick={() => setRunning(null)}>수집 중지 · 현재 요청은 저장</button> : null}
  </section>;
}

function VerifiedAramRecord({ participantId, mode, busy, command }: { participantId: string; mode: "ARAM" | "ARAM_MAYHEM"; busy: boolean; command: Command }) {
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const games = wins + losses;
  const valid = [wins, losses].every((n) => Number.isSafeInteger(n) && n >= 0) && games > 0 && games <= 100;
  const rating = valid ? aramAuctionRating({ mode, source: "ADMIN_VERIFIED", wins, losses, evidence: "preview", fetchedAt: "" }) : null;
  return <details><summary>운영자 확인 입력</summary><form className={styles.form} onSubmit={(event) => {
    const data = formData(event);
    if (valid) void command("VERIFY_ARAM_RECORD", { participantId, mode, wins, losses, evidence: data.get("evidence") });
  }}>
    <p>{mode === "ARAM_MAYHEM" ? "증바람" : "일반 칼바람"}의 최근 연속 최대 100판만 집계하세요. 5분 미만·조기 종료 경기는 제외하며, 확인 가능한 기록만 입력합니다.</p>
    <div className={styles.grid}><label>승수<input name="wins" type="number" min={0} max={100} step={1} required value={wins} onChange={(event) => setWins(event.target.valueAsNumber)} /></label><label>패수<input name="losses" type="number" min={0} max={100} step={1} required value={losses} onChange={(event) => setLosses(event.target.valueAsNumber)} /></label></div>
    <p role="status">{rating ? games + "판 · " + rating.tier + "등급 · 최소 " + rating.minimumBid + "P · 주장 " + rating.captainPoints + "P" + (rating.provisional ? " · 표본 부족" : "") : "승패 합계가 1~100판이어야 합니다."}</p>
    <label>확인 근거 · 관리자에게만 표시<input name="evidence" minLength={10} maxLength={500} required placeholder="전적 화면 출처, 확인한 기간·최근 경기 일시" /></label>
    <label><input name="verified" type="checkbox" required />해당 선수·모드·승패 및 최근 경기 범위를 확인했습니다.</label>
    <button disabled={busy || !valid}>확인 전적 저장</button>
  </form></details>;
}

function CaptainForm({ destruction, busy, command, playerLabel }: Context) {
  const [values, setValues] = useState(() => Array.from({ length: destruction.configuration.teamCount }, () => 50));
  const [captainIds, setCaptainIds] = useState(() => Array.from({ length: destruction.configuration.teamCount }, () => ""));
  const aram = ["ARAM", "ARAM_MAYHEM"].includes(destruction.configuration.gameMode ?? "CLASSIC");
  const rated = destruction.participants.every((p) => p.aramRecord?.mode === destruction.configuration.gameMode);
  const [error, setError] = useState("");
  return <section className={styles.panel}><h2>주장·경매 포인트 확정</h2><p>{aram ? "시작 포인트: 2,000P − 주장 본인의 임시 등급 최소 입찰가. 모든 참가자의 전적 평가가 필요하며 확정 후 전적·등급·포인트가 고정됩니다." : "시작 포인트: 2,000 − 기준 가치 × 10, 10P 단위 반올림, 0~2,000P 제한. 확정 후 주장을 다시 선정할 수 없으므로 확인해 주세요."}</p><form className={styles.form} onSubmit={(event) => {
    const data = formData(event); const names = data.getAll("teamName").map((name) => String(name).normalize("NFKC").trim().replace(/\s+/gu, " ")); const ids = data.getAll("captainParticipantId").map(String);
    if (new Set(names).size !== names.length || new Set(ids).size !== ids.length) { setError("팀 이름과 주장은 중복될 수 없습니다."); return; }
    setError(""); void command("CONFIRM_TEAMS", { seed: data.get("seed"), captains: names.map((name, index) => ({ teamId: crypto.randomUUID(), name, participantId: ids[index], baselineValue: values[index] })) });
  }}><label>추첨 기준 문구<input name="seed" minLength={8} maxLength={128} required placeholder="8자 이상 입력" /></label><div className={styles.grid}>{values.map((value, index) => <fieldset key={index}><legend>{index + 1}팀</legend><label>팀 이름<input name="teamName" defaultValue={`${index + 1}팀`} maxLength={50} required /></label><label>주장<select name="captainParticipantId" required value={captainIds[index]} onChange={(event) => setCaptainIds((ids) => ids.map((id, i) => i === index ? event.target.value : id))}><option value="" disabled>참가자 선택</option>{destruction.participants.map((entry) => <option key={entry.id} value={entry.id}>{playerLabel(entry.playerId)} · {competitionPositionLabel(entry.position)}</option>)}</select></label>{!aram ? <label>주장 기준 가치<input type="number" min={0} max={1000000} step="any" value={value} onChange={(event) => setValues((items) => items.map((item, i) => i === index ? Number(event.target.value) : item))} required /></label> : null}<strong>시작 {aram ? (() => { const record = destruction.participants.find((p) => p.id === captainIds[index])?.aramRecord; return record ? aramAuctionRating(record).captainPoints : "평가 대기"; })() : Number.isFinite(value) && value >= 0 ? calculateCaptainAuctionPoints(value) : 0}P</strong></fieldset>)}</div><p className={styles.muted}>{aram ? "선수별 임시 등급의 최소 입찰가가 서버에서 적용됩니다." : "선수 4명을 낙찰할 최소 4P가 필요합니다."}</p><button className={styles.primary} disabled={busy || (aram && !rated) || values.some((value) => !Number.isFinite(value) || value < 0 || calculateCaptainAuctionPoints(value) < 4)}>주장·팀 확정</button>{error ? <p role="alert">{error}</p> : null}</form></section>;
}

function Auction({ destruction, busy, command, playerLabel }: Context) {
  const drawn = destruction.participants.find((entry) => entry.auctionStatus === "DRAWN");
  const [chosenTeam, setChosenTeam] = useState("");
  const eligibility = auctionTeamEligibility(destruction, drawn?.id ?? "");
  const selected = eligibility.find((entry) => entry.teamId === chosenTeam && !entry.reason) ?? eligibility.find((entry) => !entry.reason);
  const paused = destruction.auctionPaused ?? false;
  const pending = destruction.participants.filter((entry) => entry.auctionStatus === "PENDING" || entry.auctionStatus === "HOLD");
  return <section className={styles.panel}><div className={styles.row}><h2>선수 경매 · {paused ? "일시 중단" : "진행 중"}</h2><button disabled={busy} onClick={() => void command(paused ? "RESUME_AUCTION" : "PAUSE_AUCTION", {})}>{paused ? "경매 재개" : "경매 일시 중단"}</button></div><p>운영자가 현장 입찰 결과를 입력하고 낙찰을 확정합니다. 대기 선수 추첨 후 보류 선수를 다시 추첨합니다.</p><div className={styles.grid}><article className={styles.callout}><h3>현재 추첨 선수</h3><AuctionReveal card={destructionAuctionCard(destruction, playerLabel)} /><strong>{drawn ? `${playerLabel(drawn.playerId)} · ${competitionPositionLabel(drawn.position)}` : "추첨 대기"}</strong><p>추첨 대기 {pending.length}명 · 낙찰 {destruction.participants.filter((entry) => entry.auctionStatus === "SOLD").length}명</p><div className={styles.buttons}><button className={styles.primary} disabled={busy || paused || Boolean(drawn) || !pending.length} onClick={() => void command("DRAW_AUCTION", {})}>다음 선수 추첨</button>{drawn ? <button disabled={busy || paused} onClick={() => void command("HOLD_AUCTION", { participantId: drawn.id })}>선수 보류</button> : null}</div></article>
    {drawn ? <form key={drawn.id} className={styles.form} onSubmit={(event) => { const data = formData(event); if (selected) void command("SELL_AUCTION", { participantId: drawn.id, teamId: selected.teamId, purchasePoints: Number(data.get("purchasePoints")) }); }}><h3>낙찰 확정</h3><label>낙찰 팀<select value={selected?.teamId ?? ""} onChange={(event) => setChosenTeam(event.target.value)} required>{!selected ? <option value="">낙찰 가능한 팀 없음</option> : null}{destruction.teams.map((team) => { const option = eligibility.find((entry) => entry.teamId === team.id)!; return <option key={team.id} value={team.id} disabled={Boolean(option.reason)}>{team.name} · {option.reason ?? `최대 ${option.maximum}P`}</option>; })}</select></label><label>낙찰 포인트<input key={`${drawn.id}:${selected?.teamId}`} name="purchasePoints" type="number" min={drawn.minimumBid ?? 1} max={selected?.maximum ?? 0} step={1} required /></label><p className={styles.muted}>최소 {drawn.minimumBid ?? 1}P. 남은 포지션별 후보의 최소 입찰가 중 가장 높은 금액을 보존합니다.</p><button className={styles.primary} disabled={busy || paused || !selected}>낙찰 확정</button></form> : null}
    </div><div className={styles.grid}>{destruction.teams.map((team) => <article className={styles.panel} key={team.id}><div className={styles.row}><h3>{team.name}</h3><strong>{team.remainingAuctionPoints}P</strong></div><p>시작 {team.initialAuctionPoints}P · 사용 {team.initialAuctionPoints - team.remainingAuctionPoints}P</p>{COMPETITION_POSITIONS.map((position) => { const member = destruction.participants.find((entry) => entry.teamId === team.id && entry.position === position); return <div className={styles.row} key={position}><span>{competitionPositionLabel(position)}</span><span>{member ? `${playerLabel(member.playerId)}${member.isCaptain ? " · 주장" : ` · ${member.purchasePoints}P`}` : "선발 대기"}</span></div>; })}</article>)}</div></section>;
}

function ResultForms(context: Context) {
  const { destruction, teamLabel } = context;
  const prelim = destruction.preliminaryFixtures.map((fixture) => ({ ...fixture, completed: fixture.status === "COMPLETED", preliminary: true }));
  const finals = (destruction.tournamentBracket?.fixtures ?? []).flatMap((fixture) => fixture.teamAId && fixture.teamBId ? [{ id: fixture.id, teamAId: fixture.teamAId, teamBId: fixture.teamBId, teamAScore: fixture.result?.teamAScore ?? null, teamBScore: fixture.result?.teamBScore ?? null, bestOf: fixture.bestOf, completed: Boolean(fixture.result), preliminary: false }] : []);
  return <section className={styles.panel}><h2>경기 결과 입력·정정</h2><p>승리 팀은 점수에서 자동 결정됩니다. 정정은 SUPER_ADMIN만 실행할 수 있습니다.</p><div className={styles.grid}>{[...prelim, ...finals].map((fixture) => <details className={styles.panel} key={fixture.id} open={!fixture.completed}><summary>{fixture.preliminary ? "예선" : "본선"} · {teamLabel(fixture.teamAId)} vs {teamLabel(fixture.teamBId)} · {fixture.completed ? `${fixture.teamAScore}:${fixture.teamBScore} 확정` : "입력 대기"}</summary><ResultForm key={`${fixture.id}:${fixture.teamAScore}:${fixture.teamBScore}`} {...context} fixture={fixture} /></details>)}</div></section>;
}

type EditableFixture = { id: string; teamAId: string; teamBId: string; teamAScore: number | null; teamBScore: number | null; bestOf: number; completed: boolean; preliminary: boolean };
function ResultForm({ fixture, destruction, busy, command, teamLabel, superAdmin }: Context & { fixture: EditableFixture }) {
  const [scores, setScores] = useState([fixture.teamAScore ?? 0, fixture.teamBScore ?? 0]);
  const [review, setReview] = useState<number | null>(null);
  const target = Math.floor(fixture.bestOf / 2) + 1;
  const valid = scores.every((score) => Number.isInteger(score) && score >= 0 && score <= target) && ((scores[0] === target && scores[1]! < target) || (scores[1] === target && scores[0]! < target));
  const winnerTeamId = scores[0]! > scores[1]! ? fixture.teamAId : fixture.teamBId;
  const unchanged = fixture.completed && scores[0] === fixture.teamAScore && scores[1] === fixture.teamBScore;
  const impact = destructionCorrectionImpact(destruction, fixture.id, winnerTeamId);
  const type = fixture.preliminary ? fixture.completed ? "CORRECT_PRELIMINARY_RESULT" : "RECORD_PRELIMINARY_RESULT" : fixture.completed ? "CORRECT_TOURNAMENT_RESULT" : "RECORD_TOURNAMENT_RESULT";
  const submit = () => command(type, { fixtureId: fixture.id, teamAScore: scores[0], teamBScore: scores[1], winnerTeamId });
  return <form className={styles.form} onSubmit={(event) => { event.preventDefault(); if (!valid || unchanged) return; if (fixture.completed) setReview(destruction.revision); else void submit(); }}><div className={styles.score}>{[fixture.teamAId, fixture.teamBId].map((id, index) => <label key={id}>{teamLabel(id)}<input type="number" min={0} max={target} step={1} value={scores[index]} onChange={(event) => { setReview(null); setScores((items) => items.map((score, i) => i === index ? Number(event.target.value) : score)); }} required /></label>)}</div><p>{valid ? `승리: ${teamLabel(winnerTeamId)}` : `BO${fixture.bestOf} · 한 팀이 ${target}승을 기록해야 합니다.`}</p><button disabled={busy || !valid || unchanged || (fixture.completed && !superAdmin)}>{fixture.completed ? "결과 정정 영향 검토 · SUPER" : "결과 확정"}</button>{fixture.completed && !superAdmin ? <p>정정은 SUPER_ADMIN 권한이 필요합니다.</p> : null}{review !== null ? <div className={styles.notice}><p>이 경기의 MVP 투표가 초기화됩니다. {impact.resetsTournament ? "본선 전체가 무효화되고 예선 단계로 돌아갑니다. 순위를 확인한 뒤 본선을 다시 공개해야 합니다." : impact.fixtureIds.length ? `후속 ${impact.fixtureIds.length}경기의 결과·로스터·MVP도 무효화됩니다.` : "후속 경기 결과는 유지됩니다."} 이전 기록은 감사 로그에 보존됩니다.</p>{review !== destruction.revision ? <p>대회 정보가 변경되었습니다. 다시 검토해 주세요.</p> : null}<button type="button" className={styles.danger} disabled={busy || !superAdmin || review !== destruction.revision} onClick={() => { void submit(); setReview(null); }}>영향 확인·정정 실행</button></div> : null}</form>;
}

function ReplacementForm({ destruction, busy, command, playerLabel, teamLabel, superAdmin, playerOptions }: Context & { playerOptions: readonly CompetitionPlayerOption[] }) {
  const [incomingPlayerId, setIncomingPlayerId] = useState("");
  const [participantId, setParticipantId] = useState(destruction.participants[0]?.id ?? "");
  const participant = destruction.participants.find((entry) => entry.id === participantId);
  return <section className={styles.panel}><h2>선수 교체 · SUPER</h2><p>기존 경기 로스터는 보존됩니다. 다음 경기부터 같은 포지션의 새 선수가 반영됩니다.</p><form className={styles.form} onSubmit={(event) => { const data = formData(event); if (participant) void command("REPLACE_PARTICIPANT", { replacementId: crypto.randomUUID(), participantId, incomingPlayerId, incomingPosition: participant.position, reason: data.get("reason") }); }}><label>교체 대상<select value={participantId} onChange={(event) => setParticipantId(event.target.value)}>{destruction.participants.filter((entry) => entry.teamId).map((entry) => <option key={entry.id} value={entry.id}>{teamLabel(entry.teamId!)} · {playerLabel(entry.playerId)} · {competitionPositionLabel(entry.position)}</option>)}</select></label><label>투입 선수 검색<BoundedPicker ariaLabel="교체 투입 선수" value={incomingPlayerId} options={playerOptions} disabledValues={new Set(destruction.participants.map((entry) => entry.playerId))} placeholder="닉네임 또는 태그 검색" remoteEndpoint="/api/admin/matches/editor-options/players" onChange={setIncomingPlayerId} /></label><label>교체 사유<input name="reason" minLength={2} maxLength={500} required /></label><button disabled={busy || !superAdmin || !incomingPlayerId || !participant}>선수 교체</button>{!superAdmin ? <p>SUPER_ADMIN 권한이 필요합니다.</p> : null}</form></section>;
}

function MvpAdminForm({ destruction, busy, command, playerLabel, teamLabel, superAdmin }: Context) {
  const [fixtureId, setFixtureId] = useState("");
  const ballot = destruction.mvpBallots.find((entry) => entry.fixtureId === fixtureId) ?? destruction.mvpBallots[0];
  const fixtureLabel = (id: string) => { const snapshot = destruction.rosterSnapshots.find((entry) => entry.fixtureId === id); return snapshot ? `${teamLabel(snapshot.teamAId)} vs ${teamLabel(snapshot.teamBId)}` : "경기 기록 확인 필요"; };
  return <section className={styles.panel}><h2>MVP 투표 관리 · SUPER</h2>{ballot ? <form className={styles.form} onSubmit={(event) => { const data = formData(event); const playerId = data.get("playerId"); void command(playerId ? "ASSIGN_MVP" : "RESET_MVP", playerId ? { fixtureId: ballot.fixtureId, playerId } : { fixtureId: ballot.fixtureId }); }}><label>대상 경기<select value={ballot.fixtureId} onChange={(event) => setFixtureId(event.target.value)}>{destruction.mvpBallots.map((entry) => <option key={entry.fixtureId} value={entry.fixtureId}>{fixtureLabel(entry.fixtureId)} · {entry.finalizedPlayerId ? "확정" : `${entry.votes.length}/10 투표`}</option>)}</select></label><p>{ballot.finalizedPlayerId ? `확정 MVP: ${playerLabel(ballot.finalizedPlayerId)}` : `${ballot.round}차 투표 · ${ballot.votes.length}/10명 참여`}</p><label>처리 방식<select key={ballot.fixtureId} name="playerId" defaultValue=""><option value="">기존 투표 초기화·재투표 시작</option>{ballot.participantPlayerIds.map((id) => <option key={id} value={id}>직접 지정: {playerLabel(id)}</option>)}</select></label><p>기존 투표 결과가 변경됩니다. 대상 경기와 선수를 확인해 주세요.</p><button disabled={busy || !superAdmin}>MVP 처리</button>{!superAdmin ? <p>SUPER_ADMIN 권한이 필요합니다.</p> : null}</form> : <p>경기 결과가 확정되면 투표가 생성됩니다.</p>}</section>;
}
