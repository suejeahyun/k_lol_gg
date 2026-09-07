"use client";

import { useState } from "react";

import styles from "./riot-workspace.module.css";

async function mutate(path: string, method: "POST" | "DELETE", body: object, revision?: number) {
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
      ...(revision === undefined ? {} : { "If-Match": `\"${revision}\"` }),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null) as { title?: string; authorizationUrl?: string } | null;
  if (!response.ok) throw new Error(data?.title ?? "요청을 처리하지 못했습니다.");
  return data;
}

export function RiotOwnerActions({ linkRevision, connected }: Readonly<{ linkRevision: number; connected: boolean }>) {
  const [gameName, setGameName] = useState("");
  const [tagLine, setTagLine] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(operation: () => Promise<{ title?: string; authorizationUrl?: string } | null>, success: string) {
    setPending(true); setMessage(null);
    try {
      const result = await operation();
      if (result?.authorizationUrl) {
        const authorization = new URL(result.authorizationUrl);
        if (authorization.protocol !== "https:" || authorization.hostname !== "auth.riotgames.com") {
          throw new Error("안전한 Riot 로그인 주소를 확인하지 못했습니다.");
        }
        window.location.assign(authorization.toString());
        return;
      }
      setMessage(success);
    } catch (error) { setMessage(error instanceof Error ? error.message : "요청을 처리하지 못했습니다."); }
    finally { setPending(false); }
  }

  return (
    <div>
      {!connected ? (
        <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void run(() => mutate("/api/me/riot", "POST", { gameName, tagLine }, linkRevision), "직접 연결 요청을 반영했습니다. 새로고침해 상태를 확인해 주세요."); }}>
          <label>게임 이름<input value={gameName} onChange={(event) => setGameName(event.target.value)} maxLength={16} required /></label>
          <label>태그<input value={tagLine} onChange={(event) => setTagLine(event.target.value)} maxLength={5} required /></label>
          <div className={styles.actions}><button type="submit" disabled={pending}>직접 연결</button><button data-tone="quiet" type="button" disabled={pending} onClick={() => void run(() => mutate("/api/me/riot/rso/start", "POST", { returnTo: "/account/riot" }), "RSO 연결을 준비했습니다.")}>RSO로 확인</button></div>
        </form>
      ) : (
        <div className={styles.actions}>
          <button type="button" disabled={pending} onClick={() => void run(() => mutate("/api/me/riot/sync", "POST", {}), "동기화를 요청했습니다.")}>지금 동기화</button>
          <button type="button" data-tone="quiet" disabled={pending} onClick={() => void run(() => mutate("/api/me/riot", "DELETE", {}, linkRevision), "연결을 해제했습니다. 새로고침해 상태를 확인해 주세요.")}>연결 해제</button>
        </div>
      )}
      {message ? <p className={styles.notice} role="status">{message}</p> : null}
    </div>
  );
}
