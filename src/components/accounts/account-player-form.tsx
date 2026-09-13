"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import type { AccountPlayerDto } from "@/modules/accounts/domain/account-contracts";
import {
  formatPlayerTierEditValue,
  isPlayerMasterPlusTier,
  playerDivisionTierOptions,
  playerMasterPlusTierOptions,
  playerTierEditState,
} from "@/modules/players/domain/player-tier";
import styles from "./account-access.module.css";

type Problem = { detail?: string; title?: string };
type TierFieldName = "currentTier" | "peakTier";

function AccountTierField({
  label,
  name,
  initialValue,
}: {
  label: string;
  name: TierFieldName;
  initialValue: string | null;
}) {
  const controlId = useId();
  const initial = playerTierEditState(initialValue);
  const [tier, setTier] = useState(initial.tier);
  const [score, setScore] = useState(initial.score);
  const masterPlus = isPlayerMasterPlusTier(tier);
  const value = formatPlayerTierEditValue(tier, score) ?? "";
  const helpId = `${controlId}-help`;

  return (
    <fieldset className={styles.tierField}>
      <legend>{label}</legend>
      <input type="hidden" name={name} value={value} />
      <label className={styles.field} htmlFor={controlId}>
        <span>티어 및 단계</span>
        <select
          id={controlId}
          data-tier-name={name}
          value={tier}
          onChange={(event) => {
            setTier(event.target.value);
            if (!isPlayerMasterPlusTier(event.target.value)) setScore("");
          }}
          aria-describedby={helpId}
        >
          <option value="">미입력</option>
          <optgroup label="다이아몬드 이하">
            {playerDivisionTierOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </optgroup>
          <optgroup label="마스터 이상">
            {playerMasterPlusTierOptions.map((family) => (
              <option key={family.value} value={family.value}>{family.label}</option>
            ))}
          </optgroup>
        </select>
      </label>
      {masterPlus ? (
        <label className={styles.field}>
          <span>LP(점수)</span>
          <input
            data-tier-score={name}
            type="number"
            min={0}
            max={9999}
            step={1}
            inputMode="numeric"
            required
            value={score}
            onChange={(event) => setScore(event.target.value)}
            aria-describedby={helpId}
            placeholder="예: 120"
          />
        </label>
      ) : null}
      <small id={helpId} className={styles.tierHelp}>
        다이아몬드 이하는 목록에서 선택하고, 마스터 이상은 티어를 선택한 뒤 LP만 직접 입력합니다.
      </small>
    </fieldset>
  );
}

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
        <AccountTierField label="현재 티어" name="currentTier" initialValue={player.currentTier} />
        <AccountTierField label="최고 티어" name="peakTier" initialValue={player.peakTier} />
      </div>
      <p id="account-player-riot-id-warning" className={styles.notice}>Riot ID를 변경하면 기존 Riot 전적 연동이 자동 해제됩니다. 저장 후 새 Riot ID로 다시 연동해 주세요.</p>
      <button className={styles.submit} type="submit" disabled={pending}>{pending ? "저장 중…" : "내 플레이어 정보 저장"}</button>
      {message ? <p className={styles.message} data-tone={tone} role={tone === "error" ? "alert" : "status"}>{message}</p> : null}
    </form>
  );
}
