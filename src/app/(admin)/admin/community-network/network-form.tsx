"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COMMUNITY_NETWORK_LIMITS, type CommunityNetworkCommunity, type CommunityNetworkRoom, type CommunityNetworkSnapshot } from "@/modules/community-network/domain/community-network";

import styles from "./network.module.css";

const purposes: Record<CommunityNetworkRoom["purpose"], string> = { CHAT: "대화방", RECRUIT: "구인구직방", EVENT: "대회방", NOTICE: "공지방" };
const states: Record<CommunityNetworkCommunity["state"], string> = { DRAFT: "비공개 초안", LISTED: "공개 목록에 표시", ARCHIVED: "보관" };

export default function NetworkForm({ initial }: { initial: CommunityNetworkSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [selected, setSelected] = useState(initial.communities[0]?.id ?? "");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const request = useRef<{ payload: string; key: string } | null>(null);
  const [savedIds, setSavedIds] = useState(() => ({ communities: new Set(initial.communities.map((item) => item.id)), rooms: new Set(initial.rooms.map((item) => item.id)) }));
  const community = snapshot.communities.find((item) => item.id === selected);
  const rooms = snapshot.rooms.filter((room) => room.communityId === selected);

  useEffect(() => {
    if (!dirty) return;
    function preventUnload(event: BeforeUnloadEvent) { event.preventDefault(); }
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [dirty]);

  function changed(next: CommunityNetworkSnapshot) {
    setSnapshot(next); setDirty(true); setMessage(""); setError(false);
  }
  function editCommunity(patch: Partial<CommunityNetworkCommunity>) {
    changed({ ...snapshot, communities: snapshot.communities.map((item) => item.id === selected ? { ...item, ...patch } : item),
      rooms: patch.state === "ARCHIVED" ? snapshot.rooms.map((room) => room.communityId === selected ? { ...room, active: false } : room) : snapshot.rooms });
  }
  function editRoom(id: string, patch: Partial<CommunityNetworkRoom>) {
    changed({ ...snapshot, rooms: snapshot.rooms.map((room) => room.id === id ? { ...room, ...patch } : room) });
  }
  function addCommunity() {
    const id = crypto.randomUUID();
    changed({ ...snapshot, communities: [...snapshot.communities, { id, slug: "", name: "", origin: "", description: "", state: "DRAFT" }] });
    setSelected(id);
  }
  function addRoom(purpose: CommunityNetworkRoom["purpose"]) {
    if (!community || community.state === "ARCHIVED") return;
    changed({ ...snapshot, rooms: [...snapshot.rooms, { id: crypto.randomUUID(), communityId: community.id, displayName: "", purpose, dataGroupKey: "common", active: true }] });
  }
  function discardNewCommunity() {
    if (!community || savedIds.communities.has(community.id)) return;
    const communities = snapshot.communities.filter((item) => item.id !== community.id);
    changed({ ...snapshot, communities, rooms: snapshot.rooms.filter((room) => room.communityId !== community.id) });
    setSelected(communities[0]?.id ?? "");
  }
  function discardNewRoom(id: string) {
    if (savedIds.rooms.has(id)) return;
    changed({ ...snapshot, rooms: snapshot.rooms.filter((room) => room.id !== id) });
  }
  function rememberSaved(next: CommunityNetworkSnapshot) {
    setSavedIds({ communities: new Set(next.communities.map((item) => item.id)), rooms: new Set(next.rooms.map((item) => item.id)) });
  }
  async function reload() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/community-network", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("LOAD_FAILED");
      const body = await response.json() as { snapshot: CommunityNetworkSnapshot };
      rememberSaved(body.snapshot);
      setSnapshot(body.snapshot); setSelected(body.snapshot.communities.some((item) => item.id === selected) ? selected : body.snapshot.communities[0]?.id ?? "");
      setDirty(false); setError(false); request.current = null; setMessage("최신 등록 정보를 불러왔습니다.");
    } catch { setError(true); setMessage("불러오지 못했습니다. 현재 편집 내용은 유지됩니다."); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !dirty) return;
    setBusy(true); setMessage("");
    const payload = JSON.stringify({ communities: snapshot.communities, rooms: snapshot.rooms });
    if (request.current?.payload !== payload) request.current = { payload, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/admin/community-network", { method: "PUT", credentials: "same-origin", headers: {
        "Content-Type": "application/json", "If-Match": `"${snapshot.revision}"`, "Idempotency-Key": request.current.key,
      }, body: payload });
      if (!response.ok) {
        const problem = await response.json().catch(() => null) as { title?: string; detail?: string } | null;
        setError(true);
        setMessage(response.status === 412 ? "다른 관리자가 먼저 변경했습니다. 편집 내용을 확인한 뒤 최신 정보를 다시 불러와 주세요."
          : response.status === 413 ? "등록 정보가 한 번에 저장할 수 있는 크기를 넘었습니다. 입력 길이를 줄여 주세요."
            : problem?.detail ?? problem?.title ?? "저장하지 못했습니다. 입력값과 로그인 상태를 확인해 주세요.");
        if (response.status < 500) request.current = null;
        return;
      }
      const body = await response.json() as { snapshot: CommunityNetworkSnapshot };
      rememberSaved(body.snapshot);
      setSnapshot(body.snapshot); setDirty(false); setError(false); request.current = null; setMessage("등록 정보를 저장했습니다. 실제 사이트·봇 연결은 변경하지 않았습니다.");
    } catch { setError(true); setMessage("저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 저장하면 중복 요청을 방지해 처리합니다."); }
    finally { setBusy(false); }
  }

  return <form onSubmit={save} aria-busy={busy}>
    <div className={styles.toolbar}>
      <p>커뮤니티 <strong>{snapshot.communities.length}</strong> · 등록 방 <strong>{snapshot.rooms.length}</strong></p>
      <Button type="button" variant="outline" onClick={addCommunity} disabled={busy || snapshot.communities.length >= COMMUNITY_NETWORK_LIMITS.communities}>커뮤니티 추가</Button>
    </div>
    <div className={styles.workspace}>
      <nav className={styles.list} aria-label="편집할 커뮤니티">
        {snapshot.communities.length === 0 ? <p>커뮤니티를 추가해 시작하세요.</p> : snapshot.communities.map((item) => <button type="button" key={item.id} disabled={busy}
          aria-pressed={item.id === selected} onClick={() => setSelected(item.id)}>
          <strong>{item.name || "새 커뮤니티"}</strong><span>{states[item.state]}</span>
        </button>)}
      </nav>
      {community ? <fieldset className={styles.editor} disabled={busy}>
        <legend>커뮤니티 정보</legend>
        {!savedIds.communities.has(community.id) ? <Button type="button" variant="outline" onClick={discardNewCommunity}>새 커뮤니티 추가 취소</Button> : null}
        <div className={styles.fields}>
          <label>이름<Input required maxLength={80} value={community.name} onChange={(event) => editCommunity({ name: event.target.value })} /></label>
          <label>주소용 이름<Input required maxLength={64} placeholder="예: nexus" value={community.slug} onChange={(event) => editCommunity({ slug: event.target.value })} /></label>
          <label className={styles.wide}>사이트 주소<Input required type="url" maxLength={255} placeholder="https://example.com" value={community.origin} onChange={(event) => editCommunity({ origin: event.target.value })} /></label>
          <label className={styles.wide}>공개 소개<textarea rows={3} maxLength={500} value={community.description} onChange={(event) => editCommunity({ description: event.target.value })} /></label>
          <label>공개 상태<select value={community.state} onChange={(event) => editCommunity({ state: event.target.value as CommunityNetworkCommunity["state"] })}>
            {Object.entries(states).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          <p className={styles.hint}>공개 목록에는 이름·주소·소개만 표시됩니다. 보관하면 이 커뮤니티의 등록 방도 사용 해제됩니다.</p>
        </div>
        <div className={styles.sectionTitle}><div><h2>카카오톡 방</h2><p>같은 커뮤니티에서 같은 공유 그룹을 지정한 방끼리 모집을 공유하도록 준비합니다.</p></div>
          <Button type="button" variant="outline" disabled={community.state === "ARCHIVED" || snapshot.rooms.length >= COMMUNITY_NETWORK_LIMITS.rooms} onClick={() => addRoom(rooms.some((room) => room.purpose === "CHAT") ? "RECRUIT" : "CHAT")}>방 추가</Button></div>
        {rooms.length === 0 ? <p className={styles.empty}>등록한 방이 없습니다. 대화방과 구인구직방부터 추가할 수 있습니다.</p> : rooms.map((room, index) => <section className={styles.room} key={room.id} aria-label={`${index + 1}번째 방`}>
          <div className={styles.fields}>
            <label>방 이름<Input required maxLength={100} value={room.displayName} onChange={(event) => editRoom(room.id, { displayName: event.target.value })} /></label>
            <label>방 용도<select value={room.purpose} onChange={(event) => editRoom(room.id, { purpose: event.target.value as CommunityNetworkRoom["purpose"] })}>
              {Object.entries(purposes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
            <label>모집 공유 그룹<Input required maxLength={64} value={room.dataGroupKey} onChange={(event) => editRoom(room.id, { dataGroupKey: event.target.value })} /></label>
            <label className={styles.check}><input type="checkbox" checked={room.active} disabled={community.state === "ARCHIVED"} onChange={(event) => editRoom(room.id, { active: event.target.checked })} />등록 사용</label>
          </div>
          <p className={styles.hint}>휴대폰 연결 전 · 실제 방의 연결 확인이 필요합니다.</p>
          {!savedIds.rooms.has(room.id) ? <Button type="button" variant="outline" onClick={() => discardNewRoom(room.id)}>새 방 추가 취소</Button> : null}
        </section>)}
      </fieldset> : <div className={styles.empty}><h2>커뮤니티를 등록하세요</h2><p>사이트마다 대화·구인·대회·공지 방을 추가할 수 있습니다.</p></div>}
    </div>
    <div className={styles.savebar}>
      <Button type="submit" disabled={busy || !dirty}>{busy ? "처리 중…" : "변경 저장"}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={reload}>{dirty ? "변경 취소하고 다시 불러오기" : "최신 정보 불러오기"}</Button>
      <span>{dirty ? "저장하지 않은 변경이 있습니다." : `저장 버전 ${snapshot.revision}`}</span>
    </div>
    {message ? <p className={error ? styles.error : styles.message} role={error ? "alert" : "status"}>{message}</p> : null}
    <p className={styles.hint}>현재 등록 한도: 커뮤니티 {COMMUNITY_NETWORK_LIMITS.communities}개·방 {COMMUNITY_NETWORK_LIMITS.rooms}개. 실제 봇의 처리 용량과 별개의 관리 한도입니다.</p>
  </form>;
}
