"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import styles from "./admin-shell.module.css";

export function AdminLogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/logout", { method: "POST" });
      if (!response.ok) {
        setError("관리자 세션 폐기에 실패했습니다. 현재 화면을 유지하며 다시 시도할 수 있습니다.");
        return;
      }
      router.replace("/admin/login");
      router.refresh();
    } catch {
      setError("네트워크 오류로 관리자 로그아웃을 완료하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.logoutControl}>
      <button type="button" aria-label={error ? "관리자 로그아웃 다시 시도" : "관리자 로그아웃"} disabled={busy} onClick={logout}>
        <LogOut aria-hidden="true" />
      </button>
      {error ? <span className={styles.logoutError} role="status" aria-live="polite">{error}</span> : null}
    </div>
  );
}
