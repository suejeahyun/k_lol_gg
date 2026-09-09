"use client";

import { useState } from "react";

function headers(revision: number) { return { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), "If-Match": `"${revision}"` }; }

export function KakaoRoomActions({ rooms }: { rooms: readonly { id: string; displayName: string; capabilityProfile: "RECRUIT" | "FEATURES"; revision: number; status: string; members: readonly { id: string; revision: number; role: string; senderHint: string }[] }[] }) {
  const [message, setMessage] = useState(""); const [pending, setPending] = useState(false);
  async function mutate(body: Record<string, unknown>, revision = 0) { setPending(true); setMessage(""); try { const response = await fetch("/api/admin/kakao/rooms", { method: "POST", headers: headers(revision), body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok) throw new Error(result.detail || result.code || "요청 실패"); setMessage(result.code ? `${result.capabilityProfile} 연결 코드 ${result.code} · ${new Date(result.expiresAt).toLocaleTimeString("ko-KR")} 만료` : "변경했습니다. 새로고침하면 최신 상태가 표시됩니다."); } catch (error) { setMessage(error instanceof Error ? error.message : "요청 실패"); } finally { setPending(false); } }
  return <div style={{display:"grid",gap:"1rem"}}>
    <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const targetRoomId = String(data.get("targetRoomId") ?? ""); const targetRoom = rooms.find((room) => room.id === targetRoomId); void mutate({ action: "CREATE_PAIRING", targetRoomId: targetRoomId || null, displayName: data.get("displayName"), capabilityProfile: targetRoom?.capabilityProfile ?? data.get("capabilityProfile"), ttlMinutes: 10 }); }} style={{display:"flex",flexWrap:"wrap",gap:".6rem"}}>
      <input required name="displayName" maxLength={120} placeholder="표시할 방 이름" aria-label="표시할 방 이름" />
      <select name="capabilityProfile" aria-label="방 기능"><option value="RECRUIT">구인구직</option><option value="FEATURES">사이트 기능</option></select>
      <select name="targetRoomId" aria-label="연결 대상"><option value="">새 canonical 방</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.displayName} ({room.capabilityProfile})에 설치본 추가</option>)}</select>
      <button type="submit" disabled={pending}>10분 연결 코드 발급</button>
    </form>
    {rooms.map((room) => <article key={room.id} style={{border:"1px solid #dfe7f2",borderRadius:".8rem",padding:"1rem"}}><strong>{room.displayName}</strong> <small>{room.capabilityProfile} · {room.status} · rev {room.revision}</small><div style={{display:"flex",gap:".4rem",margin:".7rem 0"}}>{(["ACTIVE","PAUSED","REVOKED"] as const).map((status) => <button type="button" key={status} disabled={pending || room.status === status} onClick={() => void mutate({action:"SET_ROOM_STATUS",roomId:room.id,status},room.revision)}>{status}</button>)}</div>{room.members.map((member) => <div key={member.id} style={{display:"flex",gap:".5rem",alignItems:"center"}}><code>{member.senderHint}</code><select value={member.role} disabled={pending} onChange={(event) => void mutate({action:"SET_MEMBER_ROLE",memberId:member.id,role:event.target.value},member.revision)}><option>MEMBER</option><option>MANAGER</option><option>ADMIN</option></select></div>)}</article>)}
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
