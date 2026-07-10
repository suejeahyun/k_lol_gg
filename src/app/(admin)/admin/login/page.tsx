"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type LoginStep = "PASSWORD" | "TWO_FACTOR";

type AdminLoginResponse = {
  success?: boolean;
  ok?: boolean;
  requiresTwoFactor?: boolean;
  message?: string;
};

export default function AdminLoginPage() {
  const router = useRouter();
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [step, setStep] = useState<LoginStep>("PASSWORD");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const buttonLabel = useMemo(() => {
    if (loading) return step === "TWO_FACTOR" ? "인증 확인 중..." : "로그인 중...";
    return step === "TWO_FACTOR" ? "인증 후 로그인" : "로그인";
  }, [loading, step]);

  const submitLogin = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (loading) return;

    try {
      setLoading(true);
      setMessage("");

      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          password,
          ...(step === "TWO_FACTOR" ? { totpCode } : {}),
        }),
      });

      const data = (await response.json().catch(() => ({}))) as AdminLoginResponse;

      if (data.requiresTwoFactor) {
        setStep("TWO_FACTOR");
        setTotpCode("");
        setMessage(data.message ?? "2단계 인증 코드를 입력해주세요.");
        setTimeout(() => codeInputRef.current?.focus(), 0);
        return;
      }

      if (!response.ok || !data.success) {
        setMessage(data.message ?? "로그인에 실패했습니다.");
        return;
      }

      router.push("/admin/matches");
      router.refresh();
    } catch (error) {
      console.error(error);
      setMessage("로그인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const resetPasswordStep = () => {
    setStep("PASSWORD");
    setTotpCode("");
    setMessage("");
  };

  return (
    <main className="admin-login-page">
      <section className="admin-login-card" aria-labelledby="admin-login-title">
        <div className="admin-login-brand">
          <span>K</span>
          <div>
            <p>ADMIN CONTROL</p>
            <h1 id="admin-login-title">관리자 로그인</h1>
          </div>
        </div>

        <form onSubmit={submitLogin} className="admin-login-form">
          <label className="admin-login-field" htmlFor="admin-id">
            <span>아이디</span>
          <input
            id="admin-id"
            type="text"
            value={id}
            disabled={step === "TWO_FACTOR" || loading}
            onChange={(e) => setId(e.target.value)}
            autoComplete="username"
          />
          </label>

          <label className="admin-login-field" htmlFor="admin-password">
            <span>비밀번호</span>
          <input
            id="admin-password"
            type="password"
            value={password}
            disabled={step === "TWO_FACTOR" || loading}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          </label>

        {step === "TWO_FACTOR" ? (
          <section
            aria-label="2단계 인증"
              className="admin-login-two-factor"
          >
              <strong>2단계 인증</strong>
            <input
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              autoComplete="one-time-code"
                className="admin-login-code"
            />
            <button
              type="button"
              onClick={resetPasswordStep}
              disabled={loading}
                className="admin-login-link-button"
            >
              아이디/비밀번호 다시 입력
            </button>
          </section>
        ) : null}

        {message ? (
            <p className={`admin-login-message admin-login-message--${step === "TWO_FACTOR" ? "info" : "error"}`}>
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading || !id || !password || (step === "TWO_FACTOR" && totpCode.length !== 6)}
            className="admin-login-submit"
        >
          {buttonLabel}
        </button>
      </form>
      </section>
    </main>
  );
}
