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
    <main style={{ padding: "24px", maxWidth: "480px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "24px" }}>
        관리자 로그인
      </h1>

      <form onSubmit={submitLogin} style={{ display: "grid", gap: "16px" }}>
        <div>
          <label htmlFor="admin-id">아이디</label>
          <input
            id="admin-id"
            type="text"
            value={id}
            disabled={step === "TWO_FACTOR" || loading}
            onChange={(e) => setId(e.target.value)}
            autoComplete="username"
            style={{
              display: "block",
              width: "100%",
              marginTop: "8px",
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: "8px",
            }}
          />
        </div>

        <div>
          <label htmlFor="admin-password">비밀번호</label>
          <input
            id="admin-password"
            type="password"
            value={password}
            disabled={step === "TWO_FACTOR" || loading}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{
              display: "block",
              width: "100%",
              marginTop: "8px",
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: "8px",
            }}
          />
        </div>

        {step === "TWO_FACTOR" ? (
          <section
            aria-label="2단계 인증"
            style={{
              display: "grid",
              gap: "10px",
              padding: "14px",
              border: "1px solid rgba(34, 211, 238, 0.35)",
              borderRadius: "12px",
              background: "rgba(34, 211, 238, 0.08)",
            }}
          >
            <div style={{ fontWeight: 700 }}>2단계 인증</div>
            <p style={{ margin: 0, fontSize: "14px", color: "#8aa" }}>
              Authenticator 앱에 표시된 6자리 코드를 입력하세요.
            </p>
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
              style={{
                display: "block",
                width: "100%",
                padding: "12px 14px",
                border: "1px solid #5eead4",
                borderRadius: "8px",
                letterSpacing: "0.2em",
                fontSize: "18px",
                textAlign: "center",
              }}
            />
            <button
              type="button"
              onClick={resetPasswordStep}
              disabled={loading}
              style={{
                justifySelf: "start",
                border: 0,
                background: "transparent",
                color: "#67e8f9",
                cursor: "pointer",
                padding: 0,
              }}
            >
              아이디/비밀번호 다시 입력
            </button>
          </section>
        ) : null}

        {message ? (
          <p style={{ margin: 0, color: step === "TWO_FACTOR" ? "#67e8f9" : "#f87171" }}>
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading || !id || !password || (step === "TWO_FACTOR" && totpCode.length !== 6)}
          style={{
            padding: "12px 16px",
            border: "1px solid #333",
            borderRadius: "8px",
            background: "#333",
            color: "#fff",
            cursor: "pointer",
            opacity: loading || !id || !password || (step === "TWO_FACTOR" && totpCode.length !== 6) ? 0.6 : 1,
          }}
        >
          {buttonLabel}
        </button>
      </form>
    </main>
  );
}
