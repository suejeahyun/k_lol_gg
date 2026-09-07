"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import type { GalleryContent, HighlightContent } from "@/modules/media";

import styles from "./admin-media.module.css";

type Props =
  | { kind: "highlight"; initial?: HighlightContent }
  | { kind: "gallery"; initial?: GalleryContent };

function nextKey() { return globalThis.crypto.randomUUID(); }

export function AdminMediaForm(props: Props) {
  const router = useRouter(); const initial = props.initial;
  const initialHighlight = props.kind === "highlight" ? props.initial : undefined;
  const initialGallery = props.kind === "gallery" ? props.initial : undefined;
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState(initialHighlight ? `https://www.youtube.com/watch?v=${initialHighlight.youtubeId}` : "");
  const [thumbnailAssetId, setThumbnailAssetId] = useState(initialHighlight?.thumbnailAssetId ?? "");
  const [sortOrder, setSortOrder] = useState(initialHighlight?.sortOrder ?? 0);
  const [imageAssetIds, setImageAssetIds] = useState(initialGallery?.imageAssetIds.join("\n") ?? "");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const base = props.kind === "highlight" ? "/api/admin/highlights" : "/api/admin/images";
  const endpoint = initial ? `${base}/${initial.id}` : base;

  async function send(method: string, body: unknown, destination?: string) {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(endpoint, {
        method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "If-Match": `"${revision}"`, "Idempotency-Key": nextKey() },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null) as { detail?: string; revision?: number; highlight?: HighlightContent; gallery?: GalleryContent } | null;
      if (!response.ok) { setMessage(payload?.detail ?? "요청을 처리하지 못했습니다."); return; }
      const nextRevision = payload?.revision ?? payload?.highlight?.revision ?? payload?.gallery?.revision;
      if (typeof nextRevision === "number") setRevision(nextRevision);
      if (destination) router.push(destination); else router.refresh();
    } catch { setMessage("네트워크 연결을 확인한 뒤 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const body = props.kind === "highlight"
      ? { title, description, youtubeUrl, thumbnailAssetId: thumbnailAssetId.trim() || null, sortOrder: Number(sortOrder) }
      : { title, description, imageAssetIds: imageAssetIds.split(/\r?\n|,/u).map((id: string) => id.trim()).filter(Boolean) };
    void send(initial ? "PATCH" : "POST", body, initial ? undefined : props.kind === "highlight" ? "/admin/highlights" : "/admin/images");
  }

  return <form className={styles.form} onSubmit={submit}>
    <label>제목<input maxLength={120} required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label>설명<textarea maxLength={4000} required value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    {props.kind === "highlight" ? <><label>YouTube 주소<input type="url" required placeholder="https://youtu.be/..." value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} /></label><div className={styles.split}><label>썸네일 자산 ID<input value={thumbnailAssetId} onChange={(event) => setThumbnailAssetId(event.target.value)} placeholder="선택 사항 · READY 자산 UUID" /></label><label>정렬 순서<input type="number" min="-100000" max="100000" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} /></label></div></> : <label>이미지 자산 ID<textarea required value={imageAssetIds} onChange={(event) => setImageAssetIds(event.target.value)} placeholder="READY GALLERY 자산 UUID를 줄마다 1개, 최대 5개" /></label>}
    <p className={styles.hint}>저장은 draft로 시작합니다. 게시 전에 연결 자산의 READY 상태와 목적을 서버가 다시 확인합니다.</p>
    {message ? <p className={styles.error} role="alert">{message}</p> : null}
    <div className={styles.actions}><button className={styles.submit} disabled={busy} type="submit">{busy ? "처리 중…" : initial ? "변경 저장" : "초안 만들기"}</button>
      {initial?.status === "DRAFT" ? <button disabled={busy} type="button" onClick={() => void send("PATCH", { action: "PUBLISH" })}>게시</button> : null}
      {initial?.status === "PUBLISHED" ? <button disabled={busy} type="button" onClick={() => void send("PATCH", { action: "UNPUBLISH" })}>게시 내리기</button> : null}
      {initial?.status === "ARCHIVED" ? <button disabled={busy} type="button" onClick={() => void send("PATCH", { action: "RESTORE" })}>draft 복구</button> : null}
      {initial && initial.status !== "ARCHIVED" ? <button className={styles.danger} disabled={busy} type="button" onClick={() => void send("DELETE", {}, props.kind === "highlight" ? "/admin/highlights" : "/admin/images")}>보관</button> : null}
      {initialGallery?.status === "PUBLISHED" ? <button disabled={busy} type="button" onClick={() => {
        const homeEndpoint = `/api/admin/images/${initialGallery.id}/home-display`; setBusy(true); setMessage(null);
        void fetch(homeEndpoint, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json", "If-Match": `"${revision}"`, "Idempotency-Key": nextKey() }, body: JSON.stringify({ showOnHome: !initialGallery.showOnHome }) }).then(async (response) => {
          const payload = await response.json().catch(() => null) as { detail?: string; revision?: number } | null;
          if (!response.ok) setMessage(payload?.detail ?? "홈 노출을 변경하지 못했습니다."); else { if (typeof payload?.revision === "number") setRevision(payload.revision); router.refresh(); }
        }).catch(() => setMessage("네트워크 연결을 확인해 주세요.")).finally(() => setBusy(false));
      }}>{initialGallery.showOnHome ? "홈에서 숨기기" : "홈에 표시"}</button> : null}
    </div>
  </form>;
}
