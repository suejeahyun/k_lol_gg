"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./workspace.module.css";

export function DestructionLiveStatus({ tournamentId, revision, enabled = true, busy = false }: { tournamentId: string; revision: number; enabled?: boolean; busy?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "live" | "offline" | "error">("checking");
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || busy) return;
    let stopped = false;
    let inFlight = false;
    let controller: AbortController | null = null;
    async function check() {
      if (stopped || inFlight || document.hidden) return;
      if (!navigator.onLine) { setState("offline"); return; }
      inFlight = true; controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 10_000);
      try {
        const response = await fetch(`/api/competitions/destruction/${tournamentId}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("unavailable");
        const body = await response.json() as { destruction?: { revision: number } };
        if (!Number.isSafeInteger(body.destruction?.revision)) throw new Error("invalid revision");
        if (stopped) return;
        setState("live"); setCheckedAt(new Date().toLocaleTimeString("ko-KR"));
        if (body.destruction!.revision > revision) router.refresh();
      } catch { if (!stopped) setState(navigator.onLine ? "error" : "offline"); }
      finally { window.clearTimeout(timeout); inFlight = false; }
    }
    const offline = () => setState("offline");
    const timer = window.setInterval(() => void check(), 8_000);
    const online = () => void check();
    window.addEventListener("online", online); window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", online);
    void check();
    return () => { stopped = true; controller?.abort(); window.clearInterval(timer); window.removeEventListener("online", online); window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", online); };
  }, [tournamentId, revision, enabled, busy, attempt, router]);
  if (!enabled) return null;
  return <div className={styles.live} data-state={state}><span role="status">{busy ? "작업 반영 중" : state === "offline" ? "오프라인 · 연결되면 자동으로 다시 확인합니다." : state === "error" ? "갱신 실패 · 마지막 확인 내용을 표시합니다." : state === "checking" ? "최신 상태 확인 중…" : "연결됨 · 8초마다 자동 확인"}</span>{checkedAt ? <small>최근 확인 {checkedAt}</small> : null}<button type="button" disabled={busy} onClick={() => { router.refresh(); setAttempt((value) => value + 1); }}>지금 새로고침</button></div>;
}
