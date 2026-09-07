"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import type { AccountPlayerDto } from "@/modules/accounts/domain/account-contracts";
import styles from "./account-access.module.css";

type Problem = { detail?: string; title?: string };

function requestKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function AccountPlayerForm({ player }: { player: AccountPlayerDto }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"success" | "error">("success");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/me/player", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"${player.revision}"`,
          "Idempotency-Key": requestKey(),
        },
        body: JSON.stringify({
          riotId: form.get("riotId"),
          peakTier: form.get("peakTier") || null,
          currentTier: form.get("currentTier") || null,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as Problem & { message?: string };
      if (!response.ok) throw new Error(body.detail ?? body.title ?? "수정하지 못했습니다.");
      setTone("success");
      setMessage(body.message ?? "플레이어 정보를 수정했습니다.");
      router.refresh();
    } catch (error) {
      setTone("error");
      setMessage(error instanceof Error ? error.message : "수정하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}>Riot ID
        <input name="riotId" defaultValue={player.riotId} required maxLength={97} autoComplete="off" />
        <small>게임 이름과 태그를 `닉네임#태그` 형식으로 입력해 주세요.</small>
      </label>
      <div className={styles.playerTierGrid}>
        <label className={styles.field}>현재 티어
          <input name="currentTier" defaultValue={player.currentTier ?? ""} maxLength={32} placeholder="예: 골드 2" />
        </label>
        <label className={styles.field}>최고 티어
          <input name="peakTier" defaultValue={player.peakTier ?? ""} maxLength={32} placeholder="예: 플래티넘 4" />
        </label>
      </div>
      <button className={styles.submit} type="submit" disabled={pending}>{pending ? "저장 중…" : "내 플레이어 정보 저장"}</button>
      {message ? <p className={styles.message} data-tone={tone} role={tone === "error" ? "alert" : "status"}>{message}</p> : null}
    </form>
  );
}
