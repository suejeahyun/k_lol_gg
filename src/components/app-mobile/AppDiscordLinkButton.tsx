"use client";

import Link from "next/link";
import { useState } from "react";

type AppDiscordLinkButtonProps = {
  linked: boolean;
  disabled?: boolean;
  next?: string;
};

export function AppDiscordLinkButton({ linked, disabled, next = "/app/me" }: AppDiscordLinkButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleUnlink = async () => {
    const ok = window.confirm("Discord 연동을 해제하겠습니까? 음성방 기록 매칭과 구인 확인에 영향이 있을 수 있습니다.");
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch("/api/account/discord/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "USER_REQUEST" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Discord 연동 해제 실패");
      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Discord 연동 해제 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (disabled) {
    return <Link className="klol-app-primary" href={`/login?next=${encodeURIComponent(next)}`}>로그인</Link>;
  }

  if (!linked) {
    return (
      <Link className="klol-app-primary" href={`/api/auth/discord/start?mode=link&next=${encodeURIComponent(next)}`}>
        연동하기
      </Link>
    );
  }

  return (
    <button type="button" className="klol-app-secondary klol-app-danger" onClick={handleUnlink} disabled={loading}>
      {loading ? "해제 중" : "연동 해제"}
    </button>
  );
}
