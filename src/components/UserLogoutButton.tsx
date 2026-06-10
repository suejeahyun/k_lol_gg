"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function UserLogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    if (loading) return;

    try {
      setLoading(true);
      const response = await fetch("/api/auth/logout", { method: "POST" });

      if (!response.ok) {
        alert("로그아웃 실패");
        return;
      }

      router.push("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      className="admin-button admin-button--danger account-logout-button"
      onClick={handleLogout}
      disabled={loading}
    >
      {loading ? "로그아웃 중" : "로그아웃"}
    </button>
  );
}
