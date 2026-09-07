"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./account-access.module.css";

function messageFrom(value: unknown) {
  if (!value || typeof value !== "object") return "비밀번호를 변경하지 못했습니다.";
  const body = value as { detail?: unknown; message?: unknown };
  return typeof body.detail === "string"
    ? body.detail
    : typeof body.message === "string"
      ? body.message
      : "비밀번호를 변경하지 못했습니다.";
}

export function AccountPasswordForm({ revision }: { revision: number }) {
  const router = useRouter();
  const [currentRevision, setCurrentRevision] = useState(revision);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const [requiresRelogin, setRequiresRelogin] = useState(false);
  const idempotency = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    const clearSensitiveFingerprint = () => {
      idempotency.current = null;
    };
    window.addEventListener("pagehide", clearSensitiveFingerprint);
    return () => window.removeEventListener("pagehide", clearSensitiveFingerprint);
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      currentPassword: String(data.get("currentPassword") ?? ""),
      newPassword: String(data.get("newPassword") ?? ""),
    };
    const confirmation = String(data.get("confirmation") ?? "");
    if (payload.newPassword !== confirmation) {
      setMessage({ text: "새 비밀번호 확인이 일치하지 않습니다.", tone: "error" });
      return;
    }
    const fingerprint = JSON.stringify(payload);
    if (idempotency.current?.fingerprint !== fingerprint) {
      idempotency.current = {
        fingerprint,
        key: `web-${crypto.randomUUID()}-${crypto.randomUUID()}`,
      };
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/password", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"${currentRevision}"`,
          "Idempotency-Key": idempotency.current.key,
        },
        body: fingerprint,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 412) {
          idempotency.current = null;
          const latest = await fetch("/api/auth/me", { cache: "no-store" })
            .then(async (result) => result.ok
              ? (await result.json() as { user?: { revision?: number } | null }).user ?? null
              : null)
            .catch(() => null);
          if (latest && Number.isSafeInteger(latest.revision)) {
            setCurrentRevision(latest.revision!);
            setMessage({
              text: "다른 작업으로 계정 정보가 변경되어 최신값을 불러왔습니다. 비밀번호를 다시 확인해 변경해 주세요.",
              tone: "error",
            });
          } else {
            setRequiresRelogin(true);
            setMessage({
              text: "다른 보안 작업으로 현재 세션이 종료되었습니다. 다시 로그인한 뒤 비밀번호를 변경해 주세요.",
              tone: "error",
            });
          }
          return;
        }
        setMessage({ text: messageFrom(body), tone: "error" });
        return;
      }
      idempotency.current = null;
      setMessage({ text: "비밀번호가 변경되었습니다. 다시 로그인해 주세요.", tone: "success" });
      form.reset();
      window.setTimeout(() => {
        router.replace("/login");
        router.refresh();
      }, 900);
    } catch {
      setMessage({ text: "네트워크 연결을 확인한 뒤 다시 시도해 주세요.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label className={styles.field}>현재 비밀번호<input name="currentPassword" type="password" autoComplete="current-password" maxLength={256} required autoFocus /></label>
      <label className={styles.field}>새 비밀번호<input name="newPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /><small>문자와 숫자를 포함한 10자 이상이어야 합니다.</small></label>
      <label className={styles.field}>새 비밀번호 확인<input name="confirmation" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
      <button className={styles.submit} type="submit" disabled={busy || requiresRelogin}>{busy ? "변경 중…" : "비밀번호 변경"}</button>
      {requiresRelogin ? <button className={styles.submit} type="button" onClick={() => router.replace("/login?next=%2Faccount%2Fpassword")}>다시 로그인</button> : null}
      <div className={styles.message} data-tone={message?.tone} role={message?.tone === "error" ? "alert" : "status"} aria-live="polite">{message?.text ?? "변경하면 현재 기기를 포함한 모든 세션이 종료됩니다."}</div>
    </form>
  );
}
