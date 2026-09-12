"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import type { AccountPlayerDto } from "@/modules/accounts/domain/account-contracts";
import styles from "./account-access.module.css";

type Problem = { detail?: string; title?: string };

function newIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function AccountPlayerForm({ player }: { player: AccountPlayerDto }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"success" | "error">("success");
  const idempotency = useRef<{ fingerprint: string; key: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      riotId: form.get("riotId"),
      peakTier: form.get("peakTier") || null,
      currentTier: form.get("currentTier") || null,
    };
    const fingerprint = JSON.stringify({ revision: player.revision, payload });
    if (idempotency.current?.fingerprint !== fingerprint) {
      idempotency.current = { fingerprint, key: newIdempotencyKey() };
    }
    try {
      const response = await fetch("/api/auth/me/player", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"${player.revision}"`,
          "Idempotency-Key": idempotency.current.key,
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as Problem & { message?: string };
      if (response.status === 412) {
        idempotency.current = null;
        setTone("error");
        setMessage("다른 작업으로 정보가 변경되어 최신값을 불러왔습니다. 내용을 확인한 뒤 다시 저장해 주세요.");
        router.refresh();
        return;
      }
      if (!response.ok) throw new Error(body.detail ?? body.title ?? "수정하지 못했습니다.");
      setTone("success");
      setMessage(body.message ?? "플레이어 정보를 수정했습니다.");
      idempotency.current = null;
      router.refresh();
    } catch (error) {
      setTone("error");
      setMessage(error instanceof Error ? error.message : "수정하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-busy={pending}>
      <label className={styles.field}>Riot ID
        <input name="riotId" defaultValue={player.riotId} required maxLength={22} autoComplete="off" aria-describedby="account-player-riot-id-help account-player-riot-id-warning" />
        <small id="account-player-riot-id-help">게임 이름은 최대 16자, 태그는 최대 5자이며 `닉네임#태그` 형식으로 입력합니다.</small>
      </label>
      <div className={styles.playerTierGrid}>
        <label className={styles.field}>현재 티어
          <input name="currentTier" defaultValue={player.currentTier ?? ""} maxLength={32} placeholder="예: 골드 2" />
        </label>
        <label className={styles.field}>최고 티어
          <input name="peakTier" defaultValue={player.peakTier ?? ""} maxLength={32} placeholder="예: 플래티넘 4" />
        </label>
      </div>
      <p id="account-player-riot-id-warning" className={styles.notice}>Riot ID를 변경하면 기존 Riot 전적 연동이 자동 해제됩니다. 저장 후 새 Riot ID로 다시 연동해 주세요.</p>
      <button className={styles.submit} type="submit" disabled={pending}>{pending ? "저장 중…" : "내 플레이어 정보 저장"}</button>
      {message ? <p className={styles.message} data-tone={tone} role={tone === "error" ? "alert" : "status"}>{message}</p> : null}
    </form>
  );
}
