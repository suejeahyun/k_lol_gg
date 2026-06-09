"use client";

import { useState } from "react";

export default function DiscordUnlinkButton() {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    const ok = window.confirm("Discord 연동을 해제하겠습니까? 음성방 기록 매칭과 역할 동기화가 중단됩니다.");
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch("/api/account/discord/unlink", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "USER_REQUEST" }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Discord 연동 해제 실패");
      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Discord 연동 해제 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return <button type="button" className="admin-button admin-button--danger" onClick={handleClick} disabled={loading}>{loading ? "해제 중" : "Discord 연동 해제"}</button>;
}
