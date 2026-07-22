"use client";

import { FormEvent, useState } from "react";

export default function ForgotPasswordForm() {
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");

    try {
      setLoading(true);

      const res = await fetch("/api/auth/password/forgot", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          name,
          nickname,
          tag,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.message || "비밀번호 초기화 요청에 실패했습니다.");
        return;
      }

      setMessage(data.message || "비밀번호 초기화 요청이 접수되었습니다.");
      window.location.href = "/login";
    } catch (error) {
      console.error("[FORGOT_PASSWORD_ERROR]", error);
      setMessage("비밀번호 초기화 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">비밀번호 찾기</h1>
        <p className="auth-description">
          계정과 플레이어 정보를 제출하면 관리자가 확인 후 임시 비밀번호를 발급합니다.
          이 화면에서는 새 비밀번호를 직접 입력하지 않습니다.
        </p>

        {message ? <p className="auth-alert auth-alert--error" role="alert">{message}</p> : null}

        <label className="auth-field">
          <span>아이디</span>
          <input
            name="username"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={32}
          />
        </label>

        <label className="auth-field">
          <span>이름</span>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
            maxLength={50}
          />
        </label>

        <label className="auth-field">
          <span>닉네임</span>
          <input
            name="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            autoComplete="off"
            required
            maxLength={100}
          />
        </label>

        <label className="auth-field">
          <span>태그</span>
          <input
            value={tag}
            name="tag"
            onChange={(e) => setTag(e.target.value)}
            placeholder="KR1"
            required
            maxLength={30}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>

        <button
          className="auth-button"
          type="submit"
          disabled={loading || !userId.trim() || !name.trim() || !nickname.trim() || !tag.trim()}
        >
          {loading ? "요청 중..." : "비밀번호 초기화 요청"}
        </button>
      </form>
    </div>
  );
}
