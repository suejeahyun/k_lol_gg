"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import styles from "./account-access.module.css";
import { normalizeAccountNext } from "@/modules/auth/application/normalize-internal-next";
import { validateNewPassword } from "@/modules/accounts/domain/account-contracts";
import { canonicalRiotId } from "@/modules/riot/domain/riot-integration";
import { SERVICE_BRAND } from "@/lib/service-brand";

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
  const safeNext = normalizeAccountNext(nextPath, "/");
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
          : safeNext === "/" ? "로그인되었습니다. 홈으로 이동합니다." : "로그인되었습니다. 하던 작업으로 돌아갑니다.",
        tone: "success",
      });
      router.push(passwordChangeRequired ? `/account/password?required=1&next=${encodeURIComponent(safeNext)}` : safeNext);
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
      {message ? <div className={styles.message} data-tone={message.tone} role={message.tone === "error" ? "alert" : "status"} aria-live="polite">
        {message.text}
      </div> : null}
      <div className={styles.links}><Link href={`/signup?next=${encodeURIComponent(safeNext)}`}>회원가입 후 계속하기</Link><Link href="/forgot-password">비밀번호 도움</Link><Link href="/admin/login">관리자 로그인</Link></div>
    </form>
  );
}

export function SignupForm({ nextPath = "/" }: { nextPath?: string }) {
  const hubAccount = SERVICE_BRAND.id === "hub";
  const safeNext = normalizeAccountNext(nextPath, "/");
  const loginHref = `/login?next=${encodeURIComponent(safeNext)}`;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [completed, setCompleted] = useState(false);
  const [invalidField, setInvalidField] = useState("");
  const completionRef = useRef<HTMLDivElement>(null);
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
    if (busy || completed) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      loginId: String(data.get("loginId") ?? ""),
      password: String(data.get("password") ?? ""),
      ...(!hubAccount ? { memberName: String(data.get("memberName") ?? ""), riotId: String(data.get("riotId") ?? "") } : {}),
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
        setMessage({ text: safeMessage(body, "가입을 처리하지 못했습니다."), tone: "error" });
        return;
      }
      idempotency.current = null;
      setMessage({ text: safeMessage(body, "가입과 자동 승인이 완료되었습니다."), tone: "success" });
      form.reset();
      setCompleted(true);
      requestAnimationFrame(() => completionRef.current?.focus());
    } catch {
      setMessage({ text: "네트워크 연결을 확인한 뒤 다시 시도해 주세요.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (completed) return <div ref={completionRef} tabIndex={-1} className={styles.form} role="status">
    <h2>가입 결과</h2>
    <p className={styles.message} data-tone="success">{message?.text}</p>
    <p>{hubAccount ? "로그인 후 커뮤니티 개설을 신청하고 신청 진행 상황을 확인할 수 있어요." : "로그인 후 내 계정에서 승인·플레이어 연결 상태를 확인할 수 있어요."}</p>
    <Link className={styles.primaryLink} href={loginHref}>로그인하고 계속하기</Link>
    <Link href="/help/contact">{hubAccount ? "가입 문의" : "가입·플레이어 연결 문의"}</Link>
  </div>;

  return (
    <form className={styles.form} onSubmit={submit} onInvalid={(event) => {
      const input = event.currentTarget.querySelector<HTMLInputElement>(":invalid") ?? event.target as HTMLInputElement;
      setInvalidField(input.name);
      setMessage({ text: input.validationMessage, tone: "error" });
    }} onInput={() => { setInvalidField(""); setMessage(null); }}>
      <label className={styles.field}>로그인 아이디<input name="loginId" autoComplete="username" minLength={4} maxLength={64} pattern="[\p{L}\p{N}._\-]{4,64}" title="4~64자의 한글, 영문, 숫자, 점, 밑줄, 하이픈을 사용해 주세요." required autoFocus aria-invalid={invalidField === "loginId" || undefined} /><small>4~64자 · 한글, 영문, 숫자, . _ -</small></label>
      <label className={styles.field}>비밀번호<input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required aria-invalid={invalidField === "password" || undefined} onInput={(event) => {
        const input = event.currentTarget;
        input.setCustomValidity(!input.value || validateNewPassword(input.value) ? "" : "비밀번호는 10~128자로 문자와 숫자를 모두 포함해 주세요.");
      }} /><small>10자 이상 · 문자와 숫자 포함</small></label>
      {!hubAccount ? <><label className={styles.field}>회원명<input name="memberName" autoComplete="name" minLength={2} maxLength={100} required aria-invalid={invalidField === "memberName" || undefined} /></label>
      <label className={styles.field}>Riot ID<input name="riotId" placeholder="GameName#TAG" autoComplete="off" minLength={3} maxLength={22} required aria-invalid={invalidField === "riotId" || undefined} onInput={(event) => {
        const input = event.currentTarget;
        try {
          const [gameName, tagLine, extra] = input.value.split("#");
          if (!input.value) { input.setCustomValidity(""); return; }
          if (extra !== undefined) throw new Error("invalid");
          canonicalRiotId({ gameName: gameName ?? "", tagLine: tagLine ?? "" });
          input.setCustomValidity("");
        } catch { input.setCustomValidity("게임 이름#태그 형식으로 입력해 주세요. 게임 이름은 최대 16자, 태그는 최대 5자입니다."); }
      }} /><small>게임 이름 최대 16자 · 태그 최대 5자</small></label></> : null}
      <label className={styles.check}><input name="termsAccepted" type="checkbox" required /><span><Link href="/terms" target="_blank">이용약관</Link>을 확인했고 계정 운영 규칙에 동의합니다.</span></label>
      <label className={styles.check}><input name="privacyAccepted" type="checkbox" required /><span><Link href="/privacy" target="_blank">개인정보 처리 안내</Link>에 따른 {hubAccount ? "계정 정보" : "계정·회원명·Riot ID"} 처리에 동의합니다.</span></label>
      <button className={styles.submit} type="submit" disabled={busy}>{busy ? "가입 중…" : "가입하기"}</button>
      <div className={styles.message} data-tone={message?.tone} role={message?.tone === "error" ? "alert" : "status"} aria-live="polite">{message?.text ?? (hubAccount ? "일반 회원으로 가입됩니다. 커뮤니티 개설은 GG HUB 운영팀의 승인이 필요합니다." : SERVICE_BRAND.id === "community" ? "가입 후 이 커뮤니티 운영진의 승인을 기다려 주세요. 기존 플레이어 연결은 별도 확인합니다." : "신규 플레이어: 즉시 승인 · 기존 플레이어: 관리자 확인 후 연결")}</div>
      <div className={styles.links}><Link href={loginHref}>이미 계정이 있어요</Link></div>
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
