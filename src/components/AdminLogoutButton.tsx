"use client";

import { useRouter } from "next/navigation";

export default function AdminLogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    const response = await fetch("/api/admin/logout", {
      method: "POST",
    });

    if (!response.ok) {
      alert("로그아웃 실패");
      return;
    }

    router.push("/admin/login");
    router.refresh();
  };

  return (
    <button
      type="button"
      className="app-button--danger-outline"
      onClick={handleLogout}
    >
      로그아웃
    </button>
  );
}