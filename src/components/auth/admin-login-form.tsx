"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import styles from "./admin-login-form.module.css";

type AdminLoginFormProps = {
  nextPath: string;
};

export function AdminLoginForm({ nextPath }: AdminLoginFormProps) {
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loginId: formData.get("loginId"),
        password: formData.get("password"),
        totpCode: formData.get("totpCode"),
      }),
    }).catch(() => null);

    if (!response) {
      setMessage("네트워크 연결을 확인하고 다시 시도해 주세요.");
      setPending(false);
      return;
    }

    const payload = await response.json().catch(() => ({})) as {
      success?: boolean;
      requiresTwoFactor?: boolean;
      requiresTwoFactorSetup?: boolean;
      message?: string;
    };

    if (response.ok && payload.success) {
      window.location.assign(payload.requiresTwoFactorSetup
        ? `/admin/security?setup=required&next=${encodeURIComponent(nextPath)}`
        : nextPath);
      return;
    }

    if (payload.requiresTwoFactor) setRequiresTwoFactor(true);
    setMessage(payload.message ?? "로그인에 실패했습니다.");
    setPending(false);
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-busy={pending}>
      <div className={styles.field}>
        <label htmlFor="admin-login-id">관리자 아이디</label>
        <Input
          id="admin-login-id"
          name="loginId"
          autoComplete="username"
          required
          maxLength={128}
          disabled={pending}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="admin-login-password">비밀번호</label>
        <Input
          id="admin-login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={256}
          disabled={pending}
        />
      </div>
      {requiresTwoFactor ? (
        <div className={styles.field}>
          <label htmlFor="admin-login-totp">인증 앱 코드</label>
          <Input
            id="admin-login-totp"
            name="totpCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            required
            disabled={pending}
            aria-describedby="admin-login-totp-help"
          />
          <small id="admin-login-totp-help">현재 표시된 6자리 코드를 입력해 주세요.</small>
        </div>
      ) : null}
      {message ? <p className={styles.message} role="alert">{message}</p> : null}
      <Button className={styles.submit} type="submit" size="lg" disabled={pending}>
        {pending ? <LoaderCircle aria-hidden="true" className={styles.spinner} /> : requiresTwoFactor
          ? <ShieldCheck aria-hidden="true" />
          : <LockKeyhole aria-hidden="true" />}
        {pending ? "확인 중…" : requiresTwoFactor ? "2단계 인증 후 로그인" : "계속"}
      </Button>
    </form>
  );
}
