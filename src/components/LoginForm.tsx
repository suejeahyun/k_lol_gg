"use client";

import { FormEvent, useEffect, useState } from "react";

function getDiscordLoginMessage(code: string | null) {
  switch (code) {
    case "missing_code":
      return "Discord 인증 코드가 전달되지 않았습니다. OAuth Redirect URI 설정을 확인하세요.";
    case "cancelled":
      return "Discord 로그인이 취소되었습니다.";
    case "failed":
      return "Discord 로그인 처리 중 오류가 발생했습니다. 서버 환경변수와 Redirect URI를 확인하세요.";
    default:
      return null;
  }
}

export default function LoginForm() {
  const [discordMessage, setDiscordMessage] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setDiscordMessage(getDiscordLoginMessage(params.get("discord")));
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setLoading(true);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "로그인 실패");
        return;
      }

      if (data.user.status !== "APPROVED") {
        alert("관리자 승인 대기 상태입니다.");
      }

      window.location.href = "/";
    } catch (error: unknown) {
      console.error("[LOGIN_ERROR]", error);
      alert("로그인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">로그인</h1>

        {discordMessage ? (
          <div className="auth-alert auth-alert--error" role="status">
            {discordMessage}
          </div>
        ) : null}

        <a className="auth-button" href="/api/auth/discord/start?next=/" style={{ textAlign: "center", textDecoration: "none", marginBottom: 12 }}>
          Discord로 로그인 / 회원가입
        </a>

        <label className="auth-field">
          <span>아이디</span>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
        </label>

        <label className="auth-field">
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <button className="auth-button" type="submit" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </button>

        <div className="auth-link-row">
          <a href="/forgot-password">비밀번호 찾기</a>
          <a href="/signup">회원가입</a>
        </div>
      </form>
    </div>
  );
}