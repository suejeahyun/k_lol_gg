"use client";

import { FormEvent, useState } from "react";

type PasswordChangeFormProps = {
  variant?: "page" | "embedded";
};

export default function PasswordChangeForm({ variant = "page" }: PasswordChangeFormProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setLoading(true);

      const res = await fetch("/api/auth/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "비밀번호 변경 실패");
        return;
      }

      alert(data.message || "비밀번호가 변경되었습니다. 다시 로그인해주세요.");
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (error) {
      console.error("[PASSWORD_CHANGE_ERROR]", error);
      alert("비밀번호 변경 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const form = (
    <form className={variant === "embedded" ? "account-password-form" : "auth-card"} onSubmit={handleSubmit}>
      {variant === "page" ? <h1 className="auth-title">비밀번호 변경</h1> : null}

      <label className={variant === "embedded" ? "account-password-form__field" : "auth-field"}>
        <span>현재 비밀번호</span>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>

      <label className={variant === "embedded" ? "account-password-form__field" : "auth-field"}>
        <span>새 비밀번호</span>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="8~32자"
          autoComplete="new-password"
        />
      </label>

      <label className={variant === "embedded" ? "account-password-form__field" : "auth-field"}>
        <span>새 비밀번호 확인</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
      </label>

      <div className={variant === "embedded" ? "account-password-form__actions" : undefined}>
        <button className={variant === "embedded" ? "admin-button" : "auth-button"} type="submit" disabled={loading}>
          {loading ? "변경 중..." : "비밀번호 변경"}
        </button>
      </div>
    </form>
  );

  if (variant === "embedded") return form;

  return <div className="auth-page">{form}</div>;
}
