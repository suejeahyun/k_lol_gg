"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AppLogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) {
        alert("로그아웃 실패");
        return;
      }
      router.push("/app/login?next=/app");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button type="button" className="klol-app-secondary klol-app-danger" onClick={handleLogout} disabled={loading}>
      {loading ? "로그아웃 중" : "로그아웃"}
    </button>
  );
}
