"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, LockKeyhole } from "@/components/theme/theme-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import styles from "./admin-login-form.module.css";

type AdminLoginFormProps = {
  nextPath: string;
};

export function AdminLoginForm({ nextPath }: AdminLoginFormProps) {
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
      }),
    }).catch(() => null);

    if (!response) {
      setMessage("네트워크 연결을 확인하고 다시 시도해 주세요.");
      setPending(false);
      return;
    }

    const payload = await response.json().catch(() => ({})) as {
      success?: boolean;
      message?: string;
    };

    if (response.ok && payload.success) {
      window.location.assign(nextPath);
      return;
    }

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
      {message ? <p className={styles.message} role="alert">{message}</p> : null}
      <Button className={styles.submit} type="submit" size="lg" disabled={pending}>
        {pending ? <LoaderCircle aria-hidden="true" className={styles.spinner} /> : <LockKeyhole aria-hidden="true" />}
        {pending ? "확인 중…" : "로그인"}
      </Button>
    </form>
  );
}
