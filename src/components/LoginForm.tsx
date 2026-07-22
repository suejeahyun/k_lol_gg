"use client";

import { FormEvent, useState } from "react";


export default function LoginForm() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");


  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");

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
        setMessage(data.message || "로그인에 실패했습니다.");
        return;
      }

      if (data.user.status !== "APPROVED") {
        setMessage("관리자 승인 대기 상태입니다. 잠시 후 홈으로 이동합니다.");
      }

      window.location.href = "/";
    } catch (error: unknown) {
      console.error("[LOGIN_ERROR]", error);
      setMessage("로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">로그인</h1>

        {message ? <p className="auth-alert auth-alert--error" role="alert">{message}</p> : null}


        <label className="auth-field">
          <span>아이디</span>
          <input
            name="username"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            autoComplete="username"
            maxLength={32}
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </label>

        <label className="auth-field">
          <span>비밀번호</span>
          <input
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            maxLength={64}
            required
          />
        </label>

        <button
          className="auth-button"
          type="submit"
          disabled={loading || !userId.trim() || !password}
        >
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
