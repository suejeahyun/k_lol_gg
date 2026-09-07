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

type ProblemBody = { detail?: string; title?: string };

export function ApplicationActions({ initial }: { initial: OwnSeasonApplication | null }) {
  const router = useRouter();
  const [mainPosition, setMainPosition] = useState<SeasonApplicationPosition>(
    initial?.mainPosition ?? "ALL",
  );
  const [subPositions, setSubPositions] = useState<SeasonApplicationPosition[]>(
    initial ? [...initial.subPositions] : [],
  );
  const [pending, setPending] = useState<"save" | "cancel" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const keys = useRef(new ClientMutationKeyStore("site-application")).current;
  const revision = initial?.revision ?? 0;
  const availableSubPositions = useMemo(
    () => availableApplicationSubPositions(mainPosition),
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
    setPending("save");
    setMessage(null);
    try {
      await mutate("POST", { mainPosition, subPositions });
      setMessage(initial ? "신청 내용을 수정했어요." : "참가 신청을 접수했어요.");
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
      await mutate("DELETE", {});
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
          <span>MY APPLICATION</span>
          <h2 id="application-action-title">{initial ? "내 신청 수정" : "오늘 참가 신청"}</h2>
        </div>
        {initial ? <strong data-status={initial.status}>{initial.status}</strong> : null}
      </div>

      <fieldset disabled={pending !== null || Boolean(initial && ["RESERVE", "CONFIRMED", "REJECTED"].includes(initial.status))}>
        <legend>주라인</legend>
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
              {position}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={pending !== null || mainPosition === "ALL" || Boolean(initial && ["RESERVE", "CONFIRMED", "REJECTED"].includes(initial.status))}>
        <legend>부라인 <small>여러 개 선택 가능</small></legend>
        {mainPosition === "ALL" ? (
          <p className={styles.positionHint}>ALL은 모든 라인을 의미해 부라인을 따로 고르지 않습니다.</p>
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
              {position}
            </label>
          ))}
        </div>}
      </fieldset>

      <div className={styles.actionButtons}>
        {!initial || !["RESERVE", "CONFIRMED", "REJECTED"].includes(initial.status) ? (
          <button type="button" onClick={save} disabled={pending !== null}>
            {pending === "save" ? "저장 중…" : initial ? "신청 수정" : "참가 신청"}
          </button>
        ) : null}
        {initial?.status === "APPLIED" ? (
          <button type="button" data-variant="danger" onClick={cancel} disabled={pending !== null}>
            {pending === "cancel" ? "취소 중…" : "내 신청 취소"}
          </button>
        ) : null}
      </div>
      {initial && ["RESERVE", "CONFIRMED", "REJECTED"].includes(initial.status) ? (
        <p className={styles.liveMessage}>관리자 검토가 끝난 신청은 라인을 직접 수정할 수 없습니다.</p>
      ) : null}
      {message ? <p className={styles.liveMessage} role="status">{message}</p> : null}
      <small className={styles.revision}>현재 revision {revision} · 다른 탭에서 바뀌면 새로고침 후 다시 저장해 주세요.</small>
    </section>
  );
}
