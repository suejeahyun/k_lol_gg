"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ClientMutationKeyStore } from "@/modules/seasons/application/client-mutation-key-store";
import type { AdminSeasonKakaoPendingApplication } from "@/modules/seasons/domain/season";

import styles from "./pending.module.css";

type Candidate = Readonly<{ id: string; displayName: string; riotId: string }>;
type ProblemBody = { detail?: string; title?: string };

export function PendingApplicationActions({ application, candidates, canMutate }: {
  application: AdminSeasonKakaoPendingApplication;
  candidates: readonly Candidate[];
  canMutate: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"resolve" | "cancel" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const keys = useRef(new ClientMutationKeyStore(`admin-kakao-pending-${application.id}`)).current;

  async function mutate(action: "resolve" | "cancel", body: Record<string, unknown>) {
    const path = `/api/admin/season-kakao-pending/${application.id}/${action}`;
    const ticket = keys.issue(`POST:${path}`, application.revision, body);
    const response = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json; charset=utf-8", "If-Match": `"${application.revision}"`, "Idempotency-Key": ticket.key }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({})) as ProblemBody;
    if (!response.ok) throw new Error(payload.detail || payload.title || "요청을 처리하지 못했습니다.");
    keys.complete(ticket);
  }

  async function resolve(formData: FormData) {
    setPending("resolve"); setMessage(null);
    try {
      await mutate("resolve", { playerId: String(formData.get("playerId") ?? ""), applicationStatus: String(formData.get("applicationStatus") ?? "") });
      setMessage("보류 신청을 시즌 신청으로 연결했습니다."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "연결하지 못했습니다."); }
    finally { setPending(null); }
  }

  async function cancel() {
    if (!window.confirm("이 Kakao 보류 신청을 취소할까요? 이력은 보존됩니다.")) return;
    setPending("cancel"); setMessage(null);
    try { await mutate("cancel", {}); setMessage("보류 신청을 취소했습니다."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "취소하지 못했습니다."); }
    finally { setPending(null); }
  }

  if (application.status !== "ACTIVE") return <p className={styles.notice}>이미 {application.status === "RESOLVED" ? "해결" : "취소"}된 신청입니다.</p>;
  if (!canMutate) return <p className={styles.notice}>ADMIN은 조회할 수 있으며, 연결·취소는 TOTP 인증을 마친 SUPER 관리자만 수행합니다.</p>;
  return <form className={styles.resolveForm} action={resolve}>
    <label>연결할 플레이어<select name="playerId" required defaultValue={application.matchedPlayer?.id ?? ""}><option value="" disabled>후보를 선택하세요</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.displayName} · {candidate.riotId}</option>)}</select></label>
    <label>반영 상태<select name="applicationStatus" defaultValue={application.reserve ? "RESERVE" : "APPLIED"}><option value="APPLIED">접수</option><option value="RESERVE">예비</option></select></label>
    <div><button type="submit" disabled={pending !== null || candidates.length === 0}>{pending === "resolve" ? "연결 중…" : "시즌 신청으로 연결"}</button><button type="button" data-variant="danger" disabled={pending !== null} onClick={cancel}>{pending === "cancel" ? "취소 중…" : "보류 신청 취소"}</button></div>
    {message ? <p role="status">{message}</p> : null}<small>SITE 신청과 이미 검토된 신청은 보존하며 Kakao 정보로 덮어쓰지 않습니다.</small>
  </form>;
}
