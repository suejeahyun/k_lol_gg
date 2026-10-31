"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Command = { body: Record<string, unknown>; revision: number; key: string };
const statusLabels = { ACTIVE: "사용 중", PAUSED: "일시 중지", REVOKED: "연결 해제" };

export function KakaoRoomActions({ rooms }: { rooms: readonly { id: string; displayName: string; capabilityProfile: "RECRUIT" | "FEATURES"; revision: number; status: string; members: readonly { id: string; revision: number; role: string; senderHint: string }[] }[] }) {
  const router = useRouter();
  const [message, setMessage] = useState(""); const [sending, setSending] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [error, setError] = useState(false);
  const [committed, setCommitted] = useState<{ id: unknown; member: boolean; revision: number } | null>(null);
  const currentRevision = committed ? (committed.member ? rooms.flatMap((room) => room.members) : rooms).find((item) => item.id === committed.id)?.revision : undefined;
  const awaitingSnapshot = !!committed && (currentRevision === undefined || currentRevision < committed.revision);
  const pending = sending || refreshing || retryAvailable || awaitingSnapshot;
  const lock = useRef(false); const unresolved = useRef<Command | null>(null);
  const refresh = () => startTransition(() => router.refresh());
  async function send(command: Command) {
    if (lock.current) return;
    lock.current = true; setSending(true); setRetryAvailable(false); setMessage(""); setError(false);
    try {
      const response = await fetch("/api/admin/kakao/rooms", { method: "POST", credentials: "same-origin", signal: AbortSignal.timeout(20_000),
        headers: { "Content-Type": "application/json", "Idempotency-Key": command.key, "If-Match": `"${command.revision}"` }, body: JSON.stringify(command.body) });
      const result = await response.json().catch(() => null) as { ok?: boolean; code?: string | null; expiresAt?: string; revision?: number; detail?: string } | null;
      if (response.status >= 500 || (response.ok && result?.ok !== true)) throw new Error("UNKNOWN_RESULT");
      if (!response.ok) {
        unresolved.current = null; setError(true);
        setMessage(response.status === 409 || response.status === 412 ? "다른 변경이 먼저 반영됐습니다. 최신 상태를 불러온 뒤 다시 선택해 주세요."
          : response.status === 401 || response.status === 403 ? "관리자 로그인과 권한을 확인해 주세요." : result?.detail ?? "입력값을 확인하고 다시 시도해 주세요.");
        if (response.status === 409 || response.status === 412) refresh();
        return;
      }
      if (command.body.action === "CREATE_PAIRING") {
        const expires = result?.expiresAt ? new Date(result.expiresAt) : null;
        if (result?.code && (!expires || !Number.isFinite(expires.getTime()))) throw new Error("INVALID_EXPIRY");
        setMessage(result?.code ? `연결 코드 ${result.code} · ${expires!.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul" })} (한국 시간) 만료`
          : "이전 연결 코드 발급은 완료됐습니다. 코드는 최초 응답에서만 표시됩니다. 확인하지 못했다면 새 코드를 발급해 주세요. 사용하지 않은 코드는 만료됩니다.");
      } else {
        if (!Number.isSafeInteger(result?.revision) || result!.revision! < 0) throw new Error("UNKNOWN_REVISION");
        setCommitted({ id: command.body.memberId ?? command.body.roomId, member: command.body.action === "SET_MEMBER_ROLE", revision: result!.revision! });
        setMessage("변경했습니다. 최신 방 상태를 불러오고 있습니다."); refresh();
      }
      unresolved.current = null;
    } catch {
      unresolved.current = command; setError(true); setRetryAvailable(true);
      setMessage("처리 결과를 확인하지 못했습니다. 요청 결과 다시 확인을 누르면 같은 요청으로 확인하며 중복 발급·변경을 방지합니다.");
    } finally { lock.current = false; setSending(false); }
  }
  function mutate(body: Record<string, unknown>, revision = 0) {
    if (pending || lock.current || unresolved.current) return;
    const command = { body, revision, key: crypto.randomUUID() }; unresolved.current = command; void send(command);
  }
  return <div style={{display:"grid",gap:"1rem",overflowWrap:"anywhere"}} aria-busy={sending || refreshing}>
    <p>사이트의 방 등록과 권한을 관리합니다. 휴대폰의 실제 대화방 연결·알림 수신 상태는 별도로 확인해야 합니다.</p>
    <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const targetRoomId = String(data.get("targetRoomId") ?? ""); const targetRoom = rooms.find((room) => room.id === targetRoomId); void mutate({ action: "CREATE_PAIRING", targetRoomId: targetRoomId || null, displayName: data.get("displayName"), capabilityProfile: targetRoom?.capabilityProfile ?? data.get("capabilityProfile"), ttlMinutes: 10 }); }} style={{display:"flex",flexWrap:"wrap",gap:".6rem"}}>
      <fieldset disabled={pending} style={{display:"flex",flexWrap:"wrap",gap:".6rem",minWidth:0}}><legend className="sr-only">방 연결 코드 발급</legend>
      <input required name="displayName" maxLength={120} placeholder="표시할 방 이름" aria-label="표시할 방 이름" />
      <select name="capabilityProfile" aria-label="방 기능"><option value="RECRUIT">구인구직</option><option value="FEATURES">사이트 기능</option></select>
      <select name="targetRoomId" aria-label="연결 대상" style={{maxWidth:"100%"}}><option value="">새 방 등록</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.displayName} ({room.capabilityProfile})에 설치본 추가</option>)}</select>
      <button type="submit" disabled={pending}>10분 연결 코드 발급</button>
      </fieldset>
    </form>
    {rooms.map((room) => <article key={room.id} style={{border:"1px solid #dfe7f2",borderRadius:".8rem",padding:"1rem"}}><strong>{room.displayName}</strong> <small>{room.capabilityProfile} · {room.status} · rev {room.revision}</small><div style={{display:"flex",gap:".4rem",flexWrap:"wrap",margin:".7rem 0"}}>{(["ACTIVE","PAUSED","REVOKED"] as const).map((status) => <button type="button" key={status} disabled={pending || room.status === status} onClick={() => void mutate({action:"SET_ROOM_STATUS",roomId:room.id,status},room.revision)}>{statusLabels[status]}</button>)}</div>{room.members.map((member) => <div key={member.id} style={{display:"flex",gap:".5rem",flexWrap:"wrap",alignItems:"center"}}><code>{member.senderHint}</code><select aria-label={`${room.displayName} · ${member.senderHint} 역할`} value={member.role} disabled={pending} onChange={(event) => void mutate({action:"SET_MEMBER_ROLE",memberId:member.id,role:event.target.value},member.revision)}><option value="MEMBER">회원</option><option value="MANAGER">매니저</option><option value="ADMIN">관리자</option></select></div>)}</article>)}
    {message ? <p role={error ? "alert" : "status"}>{message}</p> : null}
    {retryAvailable ? <button type="button" disabled={sending} onClick={() => { if (unresolved.current) void send(unresolved.current); }}>요청 결과 다시 확인</button> : null}
    <button type="button" disabled={sending || refreshing || retryAvailable} onClick={refresh}>방 상태 새로고침</button>
    {awaitingSnapshot ? <p role="status">최신 변경 내용을 확인한 뒤 다음 변경을 할 수 있습니다. 갱신이 지연되면 방 상태 새로고침을 눌러 주세요.</p> : null}
  </div>;
}
