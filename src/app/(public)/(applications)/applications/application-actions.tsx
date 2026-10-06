"use client";

import { useMemo, useRef, useState } from "react";
import { recordUsageAction } from "@/components/usage/usage-actions";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  SEASON_APPLICATION_POSITIONS,
  type OwnSeasonApplication,
  type SeasonApplicationPosition,
} from "@/modules/seasons/domain/season";
import { ClientMutationKeyStore } from "@/modules/seasons/application/client-mutation-key-store";
import {
  APPLICATION_POSITION_LABELS as POSITION_LABELS,
  availableApplicationSubPositions,
  reconcileApplicationSubPositions,
} from "@/modules/seasons/application/client-application-positions";

import styles from "./applications.module.css";

type ProblemBody = { detail?: string; title?: string; notice?: string | null };

type ApplicantPlayer = Readonly<{ displayName: string; riotId: string }>;

type ApplicationActionsProps = Readonly<{
  initial: OwnSeasonApplication | null;
  recruitNo: number;
  applicantPlayer: ApplicantPlayer;
  applyDate: string;
  mode?: string;
  closed?: boolean;
  capacity?: number;
  participantCount?: number;
}>;

function statusLabel(status: OwnSeasonApplication["status"]) {
  return {
    APPLIED: "신청",
    RESERVE: "예비",
    CONFIRMED: "확정",
    REJECTED: "거절",
    CANCELLED: "취소",
  }[status];
}

export function ApplicationActions({ initial, recruitNo, applicantPlayer, applyDate, mode = "RIFT", closed = false, capacity = 10, participantCount = 0 }: ApplicationActionsProps) {
  const router = useRouter();
  const [mainPosition, setMainPosition] = useState<SeasonApplicationPosition | null>(
    initial?.mainPosition ?? null,
  );
  const [subPositions, setSubPositions] = useState<SeasonApplicationPosition[]>(
    initial ? [...initial.subPositions] : [],
  );
  const [pending, setPending] = useState<"save" | "cancel" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reserve, setReserve] = useState(initial?.status === "RESERVE");
  const reviewed = Boolean(initial?.reviewed || (initial && ["CONFIRMED", "REJECTED"].includes(initial.status)));
  const reapplying = initial?.status === "CANCELLED";
  const isRift = mode === "RIFT";
  const full = participantCount >= capacity && initial?.status !== "APPLIED" && initial?.status !== "CONFIRMED";
  const keys = useRef(new ClientMutationKeyStore("site-application")).current;
  const revision = initial?.revision ?? 0;
  const availableSubPositions = useMemo(
    () => availableApplicationSubPositions(mainPosition ?? "ALL"),
    [mainPosition],
  );

  async function mutate(method: "POST" | "DELETE", body: Record<string, unknown>) {
    const ticket = keys.issue(method, revision, body);
    const response = await fetch("/api/applications/season", {
      method,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Idempotency-Key": ticket.key,
        "If-Match": `"${revision}"`,
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as ProblemBody;
    if (!response.ok) throw new Error(payload.detail || payload.title || "요청을 처리하지 못했습니다.");
    keys.complete(ticket);
    return payload;
  }

  async function save() {
    if (isRift && !mainPosition) { setMessage("협곡은 주라인 또는 전체 가능을 선택해주세요."); return; }
    setPending("save");
    setMessage(null);
    try {
      const result = await mutate("POST", { recruitNo, mainPosition: isRift ? mainPosition : null, subPositions: isRift ? subPositions : [], reserve });
      recordUsageAction("application.saved");
      setMessage([initial && !reapplying ? "신청 내용을 수정했어요." : "참가 신청을 접수했어요.", result.notice].filter(Boolean).join("\n"));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "신청을 처리하지 못했습니다.");
    } finally {
      setPending(null);
    }
  }

  async function cancel() {
    if (!window.confirm("본인의 오늘 참가 신청을 취소할까요?")) return;
    setPending("cancel");
    setMessage(null);
    try {
      await mutate("DELETE", { recruitNo });
      recordUsageAction("application.cancelled");
      setMessage("신청을 취소했어요.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "취소를 처리하지 못했습니다.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className={styles.actionCard} aria-labelledby="application-action-title">
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="application-action-title">{reviewed || closed ? `내 ${recruitNo}회차 신청 상태` : reapplying ? `${recruitNo}회차 다시 참가 신청` : initial ? `내 ${recruitNo}회차 신청 수정` : `오늘 ${recruitNo}회차 참가 신청`}</h2>
        </div>
        {initial ? <strong data-status={initial.status}>{statusLabel(initial.status)}</strong> : null}
      </div>

      <dl className={styles.applicationContext} aria-label="참가 신청 기준 정보">
        <div>
          <dt>플레이어</dt>
          <dd>{applicantPlayer.displayName}</dd>
          <small>{applicantPlayer.riotId}</small>
        </div>
        <div><dt>신청일</dt><dd>{applyDate}</dd></div>
        <div><dt>회차</dt><dd>{recruitNo}회차</dd></div>
        <div><dt>현재 출처</dt><dd>{initial?.source === "KAKAO" ? "카카오 연동" : "사이트"}</dd></div>
      </dl>
      {!initial ? <Link className={styles.mergeNotice} href="/help/contact">카카오 신청 회원 연결 문의</Link> : null}
      {closed ? <p className={styles.liveMessage}>모집 마감</p> : null}
      <fieldset disabled={pending !== null || reviewed || closed}>
        <legend>참가 구분</legend>
        <div className={styles.positionGrid}>
          <label data-selected={!reserve}><input type="radio" name="seat" checked={!reserve} disabled={full} onChange={() => setReserve(false)} />본 참가</label>
          <label data-selected={reserve}><input type="radio" name="seat" checked={reserve} onChange={() => setReserve(true)} />예비 참가</label>
        </div>
        {full ? <p className={styles.positionHint}>본 참가 {capacity}명 마감 · 예비 참가 가능</p> : null}
      </fieldset>
      {isRift ? <>
      <fieldset disabled={pending !== null || reviewed || closed}>
        <legend>주라인 <small>필수 선택</small></legend>
        <div className={styles.positionGrid}>
          {SEASON_APPLICATION_POSITIONS.map((position) => (
            <label key={position} data-selected={mainPosition === position}>
              <input
                type="radio"
                name="mainPosition"
                value={position}
                checked={mainPosition === position}
                onChange={() => {
                  setMainPosition(position);
                  setSubPositions((current) => reconcileApplicationSubPositions(position, current));
                }}
              />
              {POSITION_LABELS[position]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={pending !== null || mainPosition === null || mainPosition === "ALL" || reviewed || closed}>
        <legend>부라인 <small>복수 선택</small></legend>
        {mainPosition === "ALL" ? (
          <p className={styles.positionHint}>전체 가능 · 부라인 선택 불필요</p>
        ) : <div className={styles.positionGrid}>
          {availableSubPositions.map((position) => (
            <label key={position} data-selected={subPositions.includes(position)}>
              <input
                type="checkbox"
                name="subPositions"
                value={position}
                checked={subPositions.includes(position)}
                onChange={() =>
                  setSubPositions((current) =>
                    current.includes(position)
                      ? current.filter((item) => item !== position)
                      : [...current, position],
                  )
                }
              />
              {POSITION_LABELS[position]}
            </label>
          ))}
        </div>}
      </fieldset>
      </> : null}

      <div className={styles.actionButtons}>
        {!reviewed && !closed ? (
          <button type="button" onClick={save} disabled={pending !== null}>
            {pending === "save" ? "저장 중…" : reapplying ? "다시 참가 신청" : initial ? "신청 수정" : "참가 신청"}
          </button>
        ) : null}
        {!reviewed && !closed && (initial?.status === "APPLIED" || initial?.status === "RESERVE") ? (
          <button type="button" data-variant="danger" onClick={cancel} disabled={pending !== null}>
            {pending === "cancel" ? "취소 중…" : "내 신청 취소"}
          </button>
        ) : null}
      </div>
      {reviewed ? (
        <p className={styles.liveMessage}>관리자 검토 완료 · 라인 수정 불가</p>
      ) : null}
      {message ? <p className={styles.liveMessage} role="status">{message}</p> : null}
    </section>
  );
}
