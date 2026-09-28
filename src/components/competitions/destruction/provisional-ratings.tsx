"use client";

import { useState } from "react";
import type { DestructionAggregate } from "@/modules/competitions/destruction/state";
import { ABSOLUTE_TIER_FLOORS, DEFAULT_RATING_POLICY, evaluateProvisionalRating, RATING_KEYS, RATING_LABELS, ratingLabel, type RatingKey } from "@/modules/competitions/destruction/provisional-rating";
import styles from "./workspace.module.css";

type Props = { destruction: DestructionAggregate; busy: boolean; command: (type: string, payload: Record<string, unknown>) => Promise<boolean | void>; playerLabel: (id: string) => string };

export function ProvisionalRatings({ destruction, busy, command, playerLabel }: Props) {
  const policy = destruction.ratingPolicy ?? DEFAULT_RATING_POLICY;
  const editable = !destruction.teams.length && ["PLANNED", "RECRUITING", "TEAM_BUILDING"].includes(destruction.lifecycle.status);
  return <section className={styles.panel}>
    <h2>멸망전 자동 임시 티어</h2>
    <p>{policy.version !== "ABSOLUTE_V1" ? "신청자가 입력한 해당 모드 기록과 자동 수집한 솔랭·내전·챔피언 대응력·도전과제로 평가합니다. 승패는 본인 기재 자료입니다." : "일반 칼바람·솔랭·내전·챔피언 대응력·도전과제 자동 수집 기준입니다."} 화면을 닫아도 예약 작업이 이어집니다.</p>
    <p>절대평가 · {RATING_KEYS.map((key) => `${ratingLabel(key, policy)} ${policy.weights[key]}%`).join(" + ")}</p>
    <p>{Object.entries(ABSOLUTE_TIER_FLOORS).map(([tier, floor]) => `${tier} ${floor}점 이상`).join(" · ")} · 최초 환산 기준이며 검증된 증바람 실력 예측치는 아닙니다.</p>
    <p>자료 누락은 0점으로 처리하지 않습니다. 표시되는 범위는 미확인 항목이 0~100점일 때의 가능한 총점입니다. 모든 반영 항목이 준비되어야 등급·경매 포인트가 확정됩니다.</p>
    {editable ? <RatingWeights key={JSON.stringify(policy)} policy={policy} busy={busy} command={command} /> : <p>주장 확정 당시 비중·평가·경매 포인트가 고정되었습니다.</p>}
    <details><summary>항목별 초기 환산 기준</summary><ul>
      <li>{policy.version === "ABSOLUTE_V3" ? "해당 모드 판수: 승수 + 패수. 점수 = 판수 / 300 × 100, 최대 100점. 승률 미반영. 입력한 0판은 0점, 미입력은 평가 대기. 주장·팀 확정 전까지 본인이 수정할 수 있습니다." : policy.version !== "ABSOLUTE_V1" ? "해당 모드 누적 승패: 보정 승률 = (승수 + 10) / (판수 + 20), 점수 = (보정 승률 − 30%) / 40% × 100, 0~100점 제한. 0승 0패는 미확인. 주장·팀 확정 전까지 본인이 수정할 수 있습니다." : "칼바람: 최근 90일, 유효 20판 미만이면 180→365일로 확대하며 최대 100판. 5분 미만·재경기 제외, 보정 승패 40%와 역할 기여 60%, 20판 중립 보정."}</li>
      <li>솔랭: 아이언 5~15, 브론즈 15~25, 실버 25~35, 골드 35~45, 플래티넘 45~55, 에메랄드 55~65, 다이아몬드 65~80, 마스터 80~90, 그랜드마스터 90~95, 챌린저 95~100점. 단계·LP 구간 보간.</li>
      <li>내전: 현재 내전 통계 점수, 30판까지 중립 50점 쪽으로 보정. 미참여는 미확인.</li>
      <li>챔피언: 최근 180일 플레이 이력이 있는 챔피언의 누적 숙련도. 1만점 이상 40명에서 폭 점수 70점, 상위 3명 편중에 따라 최대 30점.</li>
      <li>도전과제: 지정된 칼바람 누적 성취 3개를 각 MASTER 목표 대비 환산. 모드별 판수나 승률로 해석하지 않음.</li>
    </ul></details>
    <div className={styles.grid}>{destruction.participants.map((participant) => {
      const snapshot = participant.provisionalRating;
      const result = snapshot ? evaluateProvisionalRating(snapshot) : null;
      const collecting = !participant.ratingCollection?.complete;
      return <article className={styles.callout} key={participant.id}>
        <h3>{playerLabel(participant.playerId)}</h3>
        <p role="status">{result?.tier ? `${result.score!.toFixed(2)}점 · ${result.tier}등급 · 최소 ${result.minimumBid}P · 주장 ${result.captainPoints}P` : result ? `평가 대기 · ${result.minimum.toFixed(2)}~${result.maximum.toFixed(2)}점` : "자동 평가 예약"}</p>
        <p>{collecting ? policy.version !== "ABSOLUTE_V1" ? "솔랭·내전·챔피언·도전과제 자동 수집 중" : `자동 수집 중 · 칼바람 ${participant.aramCollection?.processed ?? 0}/${participant.aramCollection?.matchIds.length ?? 100}판` : result?.tier ? "평가 완료" : "수집 완료 · 누락 자료 확인 필요"}</p>
        {participant.ratingCollection?.error ? <p>수집 재시도 대기 · {participant.ratingCollection.error} · {participant.ratingCollection.retryAt}</p> : null}
        <dl>{RATING_KEYS.map((key) => { const component = snapshot?.components[key]; return <div key={key}><dt>{ratingLabel(key, policy)} ({policy.weights[key]}%)</dt><dd>{policy.weights[key] === 0 ? "반영 제외" : component?.status === "READY" ? `${component.score?.toFixed(2)}점 · ${component.source === "SELF_REPORTED" ? "본인 기재" : component.source === "ADMIN_VERIFIED" ? "운영자 근거 확인" : "자동 조회"}` : component?.status === "ERROR" ? "조회 오류" : component?.status === "NO_DATA" ? "자료 없음" : "수집 대기"}{component ? <small> · {component.evidence}</small> : null}</dd></div>; })}</dl>
        {editable && participant.ratingCollection?.complete ? <>
          <button type="button" disabled={busy} onClick={() => void command("RETRY_RATING", { participantId: participant.id })}>자동 평가 다시 수집</button>
          {result?.missing.filter((key) => policy.weights[key] > 0 && !(key === "aram" && policy.version !== "ABSOLUTE_V1")).map((key) => <MissingRating key={key} participantId={participant.id} ratingKey={key} busy={busy} command={command} />)}
        </> : null}
      </article>;
    })}</div>
  </section>;
}

function RatingWeights({ policy, busy, command }: { policy: typeof DEFAULT_RATING_POLICY; busy: boolean; command: Props["command"] }) {
  const [weights, setWeights] = useState({ ...policy.weights });
  const valid = RATING_KEYS.every((key) => Number.isSafeInteger(weights[key]) && weights[key] >= 0 && weights[key] <= 100) && RATING_KEYS.reduce((sum, key) => sum + weights[key], 0) === 100;
  return <details><summary>평가 비중 변경</summary><form className={styles.form} onSubmit={(event) => { event.preventDefault(); if (valid) void command("SET_RATING_POLICY", { version: policy.version, weights }); }}>
    <div className={styles.grid}>{RATING_KEYS.map((key) => <label key={key}>{ratingLabel(key, policy)} (%)<input required type="number" min={0} max={100} step={1} value={Number.isNaN(weights[key]) ? "" : weights[key]} onChange={(event) => setWeights((current) => ({ ...current, [key]: event.target.value === "" ? NaN : Number(event.target.value) }))} /></label>)}</div>
    <p>합계 100% · 저장하면 이번 대회의 참가자 점수·등급을 다시 계산합니다. 주장 확정 후에는 변경할 수 없습니다.</p>
    <button type="submit" disabled={busy || !valid}>비중 저장·재계산</button>
  </form></details>;
}

function MissingRating({ participantId, ratingKey, busy, command }: { participantId: string; ratingKey: RatingKey; busy: boolean; command: Props["command"] }) {
  return <details><summary>{RATING_LABELS[ratingKey]} 누락 자료 보완</summary><form className={styles.form} onSubmit={(event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    void command("VERIFY_RATING_COMPONENT", { participantId, key: ratingKey, score: Number(data.get("score")), evidence: String(data.get("evidence")) });
  }}><p>동일한 환산 기준으로 계산한 점수와 확인한 원자료를 남겨 주세요. 운영자 확인 출처와 감사 이력이 저장됩니다.</p>
    <label>확인 점수 (0~100)<input name="score" required type="number" min={0} max={100} step="0.01" /></label>
    <label>원자료·환산 근거<textarea name="evidence" required minLength={10} maxLength={500} /></label>
    <button type="submit" disabled={busy}>근거 확인·점수 보완</button>
  </form></details>;
}
