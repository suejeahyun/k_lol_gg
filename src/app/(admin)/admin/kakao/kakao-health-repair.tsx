"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./kakao.module.css";

export function KakaoHealthRepair({ revision }: { revision: number }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [expiredSessionCount, setExpiredSessionCount] = useState(0);

  async function repair() {
    setState("running");
    const response = await fetch("/api/admin/kakao/recruit-health", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "If-Match": `"${revision}"`,
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ action: "REPAIR_EXPIRED_SESSIONS" }),
    }).catch(() => null);
    if (!response?.ok) {
      setState("error");
      return;
    }
    const body = await response.json() as { expiredSessionCount?: number };
    if (!Number.isSafeInteger(body.expiredSessionCount) || Number(body.expiredSessionCount) < 0) {
      setState("error");
      return;
    }
    setExpiredSessionCount(Number(body.expiredSessionCount));
    setState("done");
    router.refresh();
  }

  return <div className={styles.repairAction}>
    <button type="button" disabled={state === "running"} onClick={repair}>
      {state === "running" ? "정리 중…" : "만료 이미지 세션 정리"}
    </button>
    {state === "done" ? <p role="status">만료 세션 {expiredSessionCount}건을 정리했습니다.</p> : null}
    {state === "error" ? <p role="alert">정리하지 못했습니다. SUPER 2단계 인증과 최신 revision을 확인해 주세요.</p> : null}
  </div>;
}
