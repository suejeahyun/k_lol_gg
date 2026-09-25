"use client";

import { useEffect, useRef, useState } from "react";
import type { useDestructionMutation } from "./use-destruction-mutation";

type Review = { applicationId: string; status: "CONFIRMED" | "RESERVE" | "REJECTED" };

/** Keep row actions available while the shared mutation serializes aggregate revisions. */
export function useApplicationReviewQueue(tournamentId: string, revision: number, mutation: ReturnType<typeof useDestructionMutation>) {
  const [queue, setQueue] = useState<(Review & { expectedRevision: number })[]>([]);
  const pending = useRef(new Set<string>());
  const nextRevision = useRef(revision);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const { busy, retryAvailable, mutate } = mutation;
  const reviewing = queue.length > 0;
  const blocked = (busy && !reviewing) || retryAvailable || failed;

  useEffect(() => {
    // A successful response still needs its refreshed aggregate before the next If-Match.
    // An uncertain result retains the active row until the original key is retried.
    if (busy || retryAvailable || !queue.length || (activeId && !settled)) return;
    const timer = setTimeout(() => {
      if (activeId) {
        pending.current.delete(activeId);
        setQueue((items) => items.slice(1));
        setActiveId(null);
        setSettled(false);
        setFailed(false);
        return;
      }
      const review = queue[0];
      setActiveId(review.applicationId);
      void mutate(`/api/admin/competitions/destruction/${tournamentId}`, "PATCH", {
        type: "SET_APPLICATION_STATUS", payload: { applicationId: review.applicationId, status: review.status },
      }, review.expectedRevision).then((ok) => {
        if (!ok) {
          setFailed(true);
          // Do not continue decisions made against stale data after a conflict or lost response.
          const cancelled = pending.current.size - 1;
          pending.current = new Set([review.applicationId]);
          setQueue((items) => items.slice(0, 1));
          if (cancelled) setNotice(`아직 전송하지 않은 심사 ${cancelled}건을 취소했습니다. 최신 상태를 확인한 뒤 다시 선택해 주세요.`);
        }
        setSettled(true);
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [activeId, busy, mutate, queue, retryAvailable, settled, tournamentId]);

  function enqueue(review: Review) {
    if (blocked || pending.current.has(review.applicationId)) return;
    // Every successful review advances one revision. Never rebase queued decisions
    // onto another operator's changes that happen to arrive in a router refresh.
    if (!pending.current.size) nextRevision.current = revision;
    const queued = { ...review, expectedRevision: nextRevision.current++ };
    pending.current.add(review.applicationId);
    setNotice("");
    setQueue((items) => [...items, queued]);
  }

  return { reviewing, blocked, activeId, pendingIds: queue.map((item) => item.applicationId), notice, enqueue };
}
