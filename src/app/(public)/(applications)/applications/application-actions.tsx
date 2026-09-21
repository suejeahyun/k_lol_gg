"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  SEASON_APPLICATION_POSITIONS,
  type OwnSeasonApplication,
  type SeasonApplicationPosition,
} from "@/modules/seasons/domain/season";
import { ClientMutationKeyStore } from "@/modules/seasons/application/client-mutation-key-store";
import {
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

const POSITION_LABELS = { TOP: "탑", JGL: "정글", MID: "미드", ADC: "원딜", SUP: "서폿", ALL: "전체 가능" } as const;

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
      setMessage([initial ? "신청 내용을 수정했어요." : "참가 신청을 접수했어요.", result.notice].filter(Boolean).join("\n"));
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
      setMessage("신청을 취소했어요. 이력은 안전하게 보관됩니다.");
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
          <span>내 참가 신청</span>
          <h2 id="application-action-title">{initial ? `내 ${recruitNo}회차 신청 수정` : `오늘 ${recruitNo}회차 참가 신청`}</h2>
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
      <p className={styles.mergeNotice}>
        카카오에서 이름으로 먼저 접수했다면 운영진에게 회원 연결을 요청해주세요. 연결 후에는 이곳에서 같은 신청을 확인할 수 있어요.
      </p>
      {closed ? <p className={styles.liveMessage}>모집이 마감되었어요. 경기용 명단은 보관됩니다.</p> : null}
      <fieldset disabled={pending !== null || reviewed || closed}>
        <legend>참가 구분</legend>
        <div className={styles.positionGrid}>
          <label data-selected={!reserve}><input type="radio" name="seat" checked={!reserve} disabled={full} onChange={() => setReserve(false)} />본 참가</label>
          <label data-selected={reserve}><input type="radio" name="seat" checked={reserve} onChange={() => setReserve(true)} />예비 참가</label>
        </div>
        {full ? <p className={styles.positionHint}>본 참가 {capacity}명이 모였어요. 예비 참가를 선택해주세요.</p> : null}
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
        <legend>부라인 <small>여러 개 선택 가능</small></legend>
        {mainPosition === "ALL" ? (
          <p className={styles.positionHint}>모든 라인이 가능하므로 부라인을 따로 고르지 않아도 돼요.</p>
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
            {pending === "save" ? "저장 중…" : initial ? "신청 수정" : "참가 신청"}
          </button>
        ) : null}
        {!reviewed && !closed && (initial?.status === "APPLIED" || initial?.status === "RESERVE") ? (
          <button type="button" data-variant="danger" onClick={cancel} disabled={pending !== null}>
            {pending === "cancel" ? "취소 중…" : "내 신청 취소"}
          </button>
        ) : null}
      </div>
      {reviewed ? (
        <p className={styles.liveMessage}>관리자 검토가 끝난 신청은 라인을 직접 수정할 수 없습니다.</p>
      ) : null}
      {message ? <p className={styles.liveMessage} role="status">{message}</p> : null}
      <small className={styles.revision}>다른 탭에서 내용이 바뀌었다면 새로고침 후 다시 저장해 주세요.</small>
    </section>
  );
}
