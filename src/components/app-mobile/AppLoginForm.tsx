"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";

function safeNextPath(value?: string) {
  if (!value) return "/app";
  if (!value.startsWith("/")) return "/app";
  if (value.startsWith("//")) return "/app";
  if (value.startsWith("/api/")) return "/app";
  return value;
}

export function AppLoginForm({ next = "/app" }: { next?: string }) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const nextPath = useMemo(() => safeNextPath(next), [next]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setMessage("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: userId.trim(),
          password,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(data.message || "로그인에 실패했습니다.");
        return;
      }

      if (data.user?.status !== "APPROVED") {
        setMessage("로그인은 되었지만 관리자 승인 대기 상태입니다.");
        window.setTimeout(() => {
          window.location.href = nextPath;
        }, 700);
        return;
      }

      window.location.href = nextPath;
    } catch (error: unknown) {
      console.error("[APP_LOGIN_ERROR]", error);
      setMessage("로그인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="klol-app-login-page">
      <section className="klol-app-login-card" aria-labelledby="app-login-title">
        <div className="klol-app-login-mark" aria-hidden="true">K</div>
        <div className="klol-app-login-head">
          <span>K-LOL.GG APP</span>
          <h1 id="app-login-title">앱 로그인</h1>
          <p>앱 화면으로 바로 이동하기 위한 전용 로그인입니다.</p>
        </div>


        <form className="klol-app-login-form" onSubmit={handleSubmit}>
          <label>
            <span>아이디</span>
            <input
              name="username"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              autoComplete="username"
              maxLength={32}
              inputMode="text"
              placeholder="아이디 입력"
              required
            />
          </label>

          <label>
            <span>비밀번호</span>
            <input
              type="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              maxLength={64}
              placeholder="비밀번호 입력"
              required
            />
          </label>

          {message ? <p className="klol-app-login-message">{message}</p> : null}

          <button type="submit" disabled={loading || !userId.trim() || !password}>
            {loading ? "로그인 중" : "로그인"}
          </button>
        </form>

        <div className="klol-app-login-links">
          <Link href="/forgot-password">비밀번호 찾기</Link>
          <Link href="/signup">회원가입</Link>
          <Link href="/app">앱 홈</Link>
          <Link href="/terms">이용약관</Link>
          <Link href="/privacy">개인정보</Link>
        </div>
      </section>
    </main>
  );
}
