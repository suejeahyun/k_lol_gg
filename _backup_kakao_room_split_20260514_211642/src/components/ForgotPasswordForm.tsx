"use client";

import { FormEvent, useState } from "react";

export default function ForgotPasswordForm() {
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [tag, setTag] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "비밀번호 재설정 실패");
        return;
      }

      alert(data.message || "비밀번호가 재설정되었습니다.");
      window.location.href = "/login";
    } catch (error) {
      console.error("[FORGOT_PASSWORD_ERROR]", error);
      alert("비밀번호 재설정 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">비밀번호 찾기</h1>
        <p className="auth-description">
          가입 시 입력한 계정 정보와 플레이어 정보가 모두 일치해야 비밀번호를 재설정할 수 있습니다.
        </p>

        <label className="auth-field">
          <span>아이디</span>
          <input value={userId} onChange={(e) => setUserId(e.target.value)} />
        </label>

        <label className="auth-field">
          <span>이름</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="auth-field">
          <span>닉네임</span>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} />
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
          <span>새 비밀번호</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="8~32자"
            autoComplete="new-password"
          />
        </label>

        <label className="auth-field">
          <span>새 비밀번호 확인</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>

        <button className="auth-button" type="submit" disabled={loading}>
          {loading ? "재설정 중..." : "비밀번호 재설정"}
        </button>
      </form>
    </div>
  );
}
