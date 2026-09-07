"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./account-access.module.css";

export function AccountLogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        setError("세션을 안전하게 종료하지 못했습니다. 로그인 상태를 유지했으며 잠시 후 다시 시도해 주세요.");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setError("네트워크 오류로 로그아웃하지 못했습니다. 로그인 상태를 유지했으며 다시 시도할 수 있습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.logoutControl}>
      <button className={styles.submit} type="button" disabled={busy} onClick={logout}>
        {busy ? "로그아웃 확인 중…" : error ? "로그아웃 다시 시도" : "로그아웃"}
      </button>
      {error ? <p className={styles.logoutError} role="status" aria-live="polite">{error}</p> : null}
    </div>
  );
}
