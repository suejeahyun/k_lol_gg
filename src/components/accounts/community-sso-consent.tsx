"use client";
import Link from "next/link";
import { useState } from "react";
import type { CommunitySsoRequest } from "@/modules/auth/domain/community-sso";
import styles from "./account-access.module.css";

export function CommunitySsoConsent({ request, siteName, origin }: { request: CommunitySsoRequest; siteName: string; origin: string }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.currentTarget); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/community-sso/authorize", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, termsAccepted: data.get("termsAccepted") === "on", privacyAccepted: data.get("privacyAccepted") === "on", ...(request.purpose === "ADMIN" ? { password: String(data.get("password") ?? "") } : {}) }) });
      const result = await response.json();
      if (!response.ok || typeof result.redirectTo !== "string") { setMessage(typeof result.message === "string" ? result.message : "연결을 완료하지 못했습니다."); return; }
      const destination = new URL(result.redirectTo);
      if (destination.origin !== origin || destination.pathname !== "/api/auth/community-sso/callback") throw new Error("INVALID_DESTINATION");
      window.location.assign(destination.href);
    } catch { setMessage("연결 상태를 확인하고 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  return <form className={styles.form} onSubmit={submit}>
    <p><strong>{siteName}</strong>에 GG HUB 계정으로 연결합니다. 고유 계정 식별자가 이 사이트에 전달되며 비밀번호·다른 커뮤니티 기록은 전달되지 않습니다.</p>
    <p>{request.purpose === "ADMIN" ? "이 사이트에 이미 관리자 권한이 있는 계정만 관리자 화면을 사용할 수 있습니다. GG HUB 비밀번호로 본인임을 다시 확인합니다." : "처음 방문하면 이 사이트의 일반 계정을 만들고 게임 프로필 등록과 운영진의 가입 승인을 진행합니다."}</p>
    {request.purpose === "ADMIN" ? <label className={styles.field}>GG HUB 비밀번호<input name="password" type="password" autoComplete="current-password" maxLength={256} required /></label> : null}
    <label className={styles.check}><input name="termsAccepted" type="checkbox" required /><span><a href={`${origin}/terms`} target="_blank" rel="noreferrer">대상 커뮤니티 이용약관</a>을 확인하고 계정 연결·가입에 동의합니다.</span></label>
    <label className={styles.check}><input name="privacyAccepted" type="checkbox" required /><span><a href={`${origin}/privacy`} target="_blank" rel="noreferrer">대상 커뮤니티 개인정보 처리 안내</a>를 확인하고 고유 계정 식별자 제공에 동의합니다.</span></label>
    <button className={styles.submit} disabled={busy} type="submit">{busy ? "연결 중…" : `${siteName}에 로그인`}</button>
    {message ? <p role="alert" className={styles.message} data-tone="error">{message}</p> : null}
    <Link href="/">취소하고 GG HUB로 돌아가기</Link>
  </form>;
}
