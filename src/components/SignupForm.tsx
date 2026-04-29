"use client";

import { FormEvent, useState } from "react";

export default function SignupForm() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setLoading(true);

      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
          body: JSON.stringify({
            userId,
            password,
            name,
            nickname,
            tag,
          }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "회원가입 실패");
        return;
      }

      alert("회원가입이 완료되었습니다. 관리자 승인 후 이용 가능합니다.");
      window.location.href = "/login";
    } catch (error: unknown) {
      console.error("[SIGNUP_ERROR]", error);
      alert("회원가입 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">회원가입</h1>
        <label className="auth-field">
          <span>이름</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
            placeholder="대상혁"
            />
        </label>
        <label className="auth-field">
          <span>닉네임</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Hide On Bush"
          />
        </label>
        <label className="auth-field">
          <span>태그</span>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="KR1"
          />
        </label>
          <label className="auth-field">
          <span>아이디</span>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="6~20자"
          />
        </label>
        <label className="auth-field">
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8~32자"
          />
        </label>

        <button className="auth-button" type="submit" disabled={loading}>
          {loading ? "가입 중..." : "회원가입"}
        </button>
      </form>
    </div>
  );
}