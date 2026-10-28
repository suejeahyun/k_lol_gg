"use client";
import Link from "next/link";
import { useState } from "react";
import styles from "./account-access.module.css";

export function CommunityProfileForm() {
  const [busy, setBusy] = useState(false), [completed, setCompleted] = useState(false), [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || completed) return;
    const data = new FormData(event.currentTarget); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/community-profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberName: data.get("memberName"), riotId: data.get("riotId") }) });
      const body = await response.json(); setMessage(body.message ?? "처리 결과를 확인할 수 없습니다."); setCompleted(response.ok);
    } catch { setMessage("연결 상태를 확인하고 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  return <form className={styles.form} onSubmit={submit}>
    <p>이 커뮤니티에서 사용할 게임 프로필을 등록하세요. 기존 플레이어와 일치하면 운영진이 연결을 확인합니다. 다른 사이트의 전적과 제재 기록은 가져오지 않습니다.</p>
    {!completed ? <><label className={styles.field}>회원명<input name="memberName" minLength={2} maxLength={100} required autoComplete="name" /></label><label className={styles.field}>Riot ID<input name="riotId" placeholder="게임 이름#태그" minLength={3} maxLength={22} required /></label><button className={styles.submit} disabled={busy} type="submit">{busy ? "등록 중…" : "프로필 등록"}</button></> : null}
    {message ? <p role={completed ? "status" : "alert"}>{message}</p> : null}
    <Link href="/account">내 계정에서 상태 확인</Link><Link href="/help/contact">운영팀 문의</Link>
  </form>;
}
