"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function SignupForm() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");

  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [tag, setTag] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");

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
          termsAccepted,
          privacyAccepted,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.message || "회원가입에 실패했습니다.");
        return;
      }

      setMessage("회원가입이 완료되었습니다. 관리자 승인 후 이용 가능합니다.");
      window.location.href = "/login";
    } catch (error: unknown) {
      console.error("[SIGNUP_ERROR]", error);
      setMessage("회원가입 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">회원가입</h1>

        {message ? <p className="auth-alert auth-alert--error" role="alert">{message}</p> : null}

        <label className="auth-field">
          <span>이름</span>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="대상혁"
            required
            maxLength={50}
            autoComplete="name"
          />
        </label>

        <label className="auth-field">
          <span>닉네임</span>
          <input
            name="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Hide On Bush"
            required
            maxLength={100}
            autoComplete="off"
          />
        </label>

        <label className="auth-field">
          <span>태그</span>
          <input
            name="tag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="KR1"
            required
            maxLength={30}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>

        <div className="auth-riot-note">
          <strong>티어는 가입 후 Riot API로 자동 반영됩니다.</strong>
          <p>닉네임#태그로 계정을 만든 뒤 내 정보에서 Riot 연동과 솔랭 동기화를 진행하세요.</p>
        </div>

        <label className="auth-field">
          <span>아이디</span>
          <input
            name="username"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="4~32자"
            required
            minLength={4}
            maxLength={32}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>

        <label className="auth-field">
          <span>비밀번호</span>
          <input
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8~64자"
            required
            minLength={8}
            maxLength={64}
            autoComplete="new-password"
          />
        </label>

        <div className="auth-consents" role="group" aria-label="필수 동의">
          <label className="auth-consent">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(event) => setTermsAccepted(event.target.checked)}
              required
            />
            <span>
              <Link href="/terms" target="_blank">이용약관</Link>에 동의합니다. (필수)
            </span>
          </label>
          <label className="auth-consent">
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={(event) => setPrivacyAccepted(event.target.checked)}
              required
            />
            <span>
              <Link href="/privacy" target="_blank">개인정보처리방침</Link>에 동의합니다. (필수)
            </span>
          </label>
        </div>

        <button
          className="auth-button"
          type="submit"
          disabled={loading || !termsAccepted || !privacyAccepted}
        >
          {loading ? "가입 중..." : "회원가입"}
        </button>
      </form>
    </div>
  );
}
