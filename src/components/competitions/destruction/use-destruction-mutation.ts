"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type RequestSnapshot = { path: string; method: string; body: string; key: string; revision: number };

export function useDestructionMutation(revision: number) {
  const router = useRouter();
  const lock = useRef(false);
  const unresolved = useRef<RequestSnapshot | null>(null);
  const [sending, setSending] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [committedRevision, setCommittedRevision] = useState(0);
  const refresh = () => startTransition(() => router.refresh());
  const busy = sending || refreshing || revision < committedRevision;

  async function send(snapshot: RequestSnapshot) {
    if (lock.current) return;
    lock.current = true; setSending(true); setRetryAvailable(false); setMessage("");
    try {
      const response = await fetch(snapshot.path, {
        method: snapshot.method,
        headers: { "Content-Type": "application/json", "X-Destruction-Revision": `"${snapshot.revision}"`, "Idempotency-Key": snapshot.key },
        body: snapshot.body,
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status >= 500) throw new Error("서버 응답을 확인하지 못했습니다. 같은 요청을 다시 확인해 주세요.");
      const result = await response.json() as { revision?: number; detail?: string };
      unresolved.current = null;
      if (!response.ok) {
        setMessage(response.status === 412 ? "다른 작업으로 대회 정보가 변경됐습니다. 최신 내용을 확인하고 다시 실행해 주세요." : result.detail ?? "요청을 처리하지 못했습니다.");
        if (response.status === 412 || response.status === 409) refresh();
        return false;
      }
      if (typeof result.revision === "number") setCommittedRevision(result.revision);
      setMessage("작업을 반영했습니다."); refresh(); return true;
    } catch {
      unresolved.current = snapshot;
      setRetryAvailable(true);
      setMessage("연결이 끊겨 처리 결과를 확인하지 못했습니다. ‘요청 결과 다시 확인’을 누르면 중복 처리 없이 확인합니다."); return false;
    } finally { lock.current = false; setSending(false); }
  }

  async function mutate(path: string, method: string, payload: unknown, expectedRevision = revision) {
    if (busy || lock.current) return;
    if (unresolved.current) { setMessage("이전 요청의 처리 결과부터 다시 확인해 주세요."); return; }
    const snapshot = { path, method, body: JSON.stringify(payload), key: `destruction-${crypto.randomUUID()}`, revision: expectedRevision };
    unresolved.current = snapshot;
    return await send(snapshot);
  }

  return { busy, message, setMessage, mutate, refresh, retryAvailable, retry: () => unresolved.current ? send(unresolved.current) : Promise.resolve() };
}
