"use client";

import { FormEvent, useState } from "react";

export default function ForgotPasswordForm() {
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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
        alert(data.message || "비밀번호 초기화 요청 실패");
        return;
      }

      alert(data.message || "비밀번호 초기화 요청이 접수되었습니다.");
      window.location.href = "/login";
    } catch (error) {
      console.error("[FORGOT_PASSWORD_ERROR]", error);
      alert("비밀번호 초기화 요청 중 오류가 발생했습니다.");
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

        <label className="auth-field">
          <span>아이디</span>
          <input value={userId} onChange={(e) => setUserId(e.target.value)} required maxLength={32} />
        </label>

        <label className="auth-field">
          <span>이름</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={50} />
        </label>

        <label className="auth-field">
          <span>닉네임</span>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} required maxLength={100} />
        </label>

        <label className="auth-field">
          <span>태그</span>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="KR1"
            required
            maxLength={30}
          />
        </label>

        <button className="auth-button" type="submit" disabled={loading}>
          {loading ? "요청 중..." : "비밀번호 초기화 요청"}
        </button>
      </form>
    </div>
  );
}
