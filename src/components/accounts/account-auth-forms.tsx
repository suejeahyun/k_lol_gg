"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import styles from "./account-access.module.css";
import { normalizeAccountNext } from "@/modules/auth/application/normalize-internal-next";

type Message = Readonly<{ text: string; tone: "error" | "success" }> | null;

function safeMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const record = value as { detail?: unknown; message?: unknown; title?: unknown };
  for (const candidate of [record.detail, record.message, record.title]) {
    if (typeof candidate === "string" && candidate.length <= 500) return candidate;
  }
  return fallback;
}

function stableIdempotencyKey(
  cache: React.MutableRefObject<{ fingerprint: string; key: string } | null>,
  fingerprint: string,
) {
  if (cache.current?.fingerprint === fingerprint) return cache.current.key;
  const key = `web-${crypto.randomUUID()}-${crypto.randomUUID()}`;
  cache.current = { fingerprint, key };
  return key;
}

export function UserLoginForm({ nextPath = "/" }: { nextPath?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      loginId: String(data.get("loginId") ?? ""),
      password: String(data.get("password") ?? ""),
    };
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null) as {
        account?: { mustChangePassword?: boolean };
      } | null;
      if (!response.ok) {
        setMessage({ text: safeMessage(body, "로그인하지 못했습니다."), tone: "error" });
        return;
      }
      const passwordChangeRequired = body?.account?.mustChangePassword === true;
      setMessage({
        text: passwordChangeRequired
          ? "로그인되었습니다. 먼저 비밀번호를 변경해 주세요."
          : "로그인되었습니다. 홈으로 이동합니다.",
        tone: "success",
      });
      const safeNext = normalizeAccountNext(nextPath, "/");
      router.push(passwordChangeRequired ? "/account/password?required=1" : safeNext);
      router.refresh();
    } catch {
      setMessage({ text: "네트워크 연결을 확인한 뒤 다시 시도해 주세요.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label className={styles.field}>아이디<input name="loginId" autoComplete="username" minLength={4} maxLength={64} required autoFocus /></label>
      <label className={styles.field}>비밀번호<input name="password" type="password" autoComplete="current-password" minLength={1} maxLength={256} required /></label>
      <button className={styles.submit} type="submit" disabled={busy}>{busy ? "확인 중…" : "로그인"}</button>
      <div className={styles.message} data-tone={message?.tone} role={message?.tone === "error" ? "alert" : "status"} aria-live="polite">
        {message?.text ?? "승인 대기·거절·이용 제한 계정도 상태 확인과 비밀번호 변경을 위해 로그인할 수 있습니다."}
      </div>
      <div className={styles.links}><Link href="/signup">가입 신청</Link><Link href="/forgot-password">비밀번호 도움</Link><Link href="/admin/login">관리자 로그인</Link></div>
    </form>
  );
}

export function SignupForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const idempotency = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    const clearSensitiveFingerprint = () => {
      idempotency.current = null;
    };
    window.addEventListener("pagehide", clearSensitiveFingerprint);
    return () => window.removeEventListener("pagehide", clearSensitiveFingerprint);
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      loginId: String(data.get("loginId") ?? ""),
      password: String(data.get("password") ?? ""),
      memberName: String(data.get("memberName") ?? ""),
      riotId: String(data.get("riotId") ?? ""),
      termsAccepted: data.get("termsAccepted") === "on",
      privacyAccepted: data.get("privacyAccepted") === "on",
    };
    const fingerprint = JSON.stringify(payload);
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": stableIdempotencyKey(idempotency, fingerprint),
        },
        body: fingerprint,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage({ text: safeMessage(body, "가입 신청을 처리하지 못했습니다."), tone: "error" });
        return;
      }
      idempotency.current = null;
      setMessage({ text: safeMessage(body, "가입 신청이 접수되었습니다."), tone: "success" });
      form.reset();
      window.setTimeout(() => router.push("/login"), 900);
    } catch {
      setMessage({ text: "네트워크 연결을 확인한 뒤 다시 시도해 주세요.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label className={styles.field}>로그인 아이디<input name="loginId" autoComplete="username" minLength={4} maxLength={64} required autoFocus /><small>4~64자, 한글·영문·숫자와 . _ - 를 사용할 수 있습니다.</small></label>
      <label className={styles.field}>비밀번호<input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /><small>문자와 숫자를 포함한 10자 이상으로 만들어 주세요.</small></label>
      <label className={styles.field}>회원명<input name="memberName" autoComplete="name" minLength={2} maxLength={100} required /></label>
      <label className={styles.field}>Riot ID<input name="riotId" placeholder="GameName#TAG" autoComplete="off" minLength={3} maxLength={97} required /><small>기존 플레이어와 일치하면 즉시 연결하지 않고 관리자 수동 검토를 거칩니다.</small></label>
      <label className={styles.check}><input name="termsAccepted" type="checkbox" required /><span><Link href="/terms" target="_blank">이용약관</Link>을 확인했고 계정 운영 규칙에 동의합니다.</span></label>
      <label className={styles.check}><input name="privacyAccepted" type="checkbox" required /><span><Link href="/privacy" target="_blank">개인정보 처리 안내</Link>에 따른 계정·회원명·Riot ID 처리에 동의합니다.</span></label>
      <button className={styles.submit} type="submit" disabled={busy}>{busy ? "접수 중…" : "가입 신청 보내기"}</button>
      <div className={styles.message} data-tone={message?.tone} role={message?.tone === "error" ? "alert" : "status"} aria-live="polite">{message?.text ?? "가입 신청 후 승인 전에는 계정 상태와 비밀번호만 관리할 수 있습니다."}</div>
      <div className={styles.links}><Link href="/login">이미 계정이 있어요</Link></div>
    </form>
  );
}

export function PasswordRecoveryForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const idempotency = useRef<{ fingerprint: string; key: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = { loginId: String(new FormData(form).get("loginId") ?? "") };
    const fingerprint = JSON.stringify(payload);
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/reset-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": stableIdempotencyKey(idempotency, fingerprint),
        },
        body: fingerprint,
      });
      const body = await response.json().catch(() => null);
      setMessage({
        text: response.ok
          ? safeMessage(body, "요청이 접수되었습니다.")
          : safeMessage(body, "요청을 처리하지 못했습니다."),
        tone: response.ok ? "success" : "error",
      });
    } catch {
      setMessage({ text: "네트워크 연결을 확인한 뒤 다시 시도해 주세요.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label className={styles.field}>로그인 아이디<input name="loginId" autoComplete="username" maxLength={64} required autoFocus /></label>
      <button className={styles.submit} type="submit" disabled={busy}>{busy ? "요청 중…" : "비밀번호 재설정 요청"}</button>
      <div className={styles.message} data-tone={message?.tone} role={message?.tone === "error" ? "alert" : "status"} aria-live="polite">{message?.text ?? "계정 존재 여부는 공개하지 않습니다. 일치하는 계정이 있으면 관리자 검토 목록에 표시됩니다."}</div>
      <div className={styles.links}><Link href="/login">로그인으로 돌아가기</Link></div>
    </form>
  );
}
