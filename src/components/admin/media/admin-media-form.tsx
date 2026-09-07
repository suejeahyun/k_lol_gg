"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import type { GalleryContent, HighlightContent } from "@/modules/media";
import { PRIVATE_ASSET_MAX_BYTES } from "@/modules/assets/domain/private-asset";

import styles from "./admin-media.module.css";

type Asset = Readonly<{
  assetId: string;
  purpose: string;
  status: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
  createdAt: string;
}>;

type Props =
  | { kind: "highlight"; initial?: HighlightContent; uploadAvailable: boolean }
  | { kind: "gallery"; initial?: GalleryContent; uploadAvailable: boolean };

function nextKey() { return globalThis.crypto.randomUUID(); }
function assetLabel(asset: Asset) { return `${asset.width}×${asset.height} · ${(asset.byteSize / 1024).toFixed(0)} KB · ${asset.contentType.replace("image/", "").toUpperCase()}`; }

export function AdminMediaForm(props: Props) {
  const router = useRouter();
  const initial = props.initial;
  const initialHighlight = props.kind === "highlight" ? props.initial : undefined;
  const initialGallery = props.kind === "gallery" ? props.initial : undefined;
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState(initialHighlight ? `https://www.youtube.com/watch?v=${initialHighlight.youtubeId}` : "");
  const [sortOrder, setSortOrder] = useState(initialHighlight?.sortOrder ?? 0);
  const [assetIds, setAssetIds] = useState<string[]>(initialHighlight?.thumbnailAssetId ? [initialHighlight.thumbnailAssetId] : [...(initialGallery?.imageAssetIds ?? [])]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const base = props.kind === "highlight" ? "/api/admin/highlights" : "/api/admin/images";
  const endpoint = initial ? `${base}/${initial.id}` : base;
  const assetEndpoint = initial ? `${endpoint}/assets` : null;
  const editable = initial?.status === "DRAFT";

  useEffect(() => {
    if (!assetEndpoint || !editable) return;
    let active = true;
    void fetch(assetEndpoint, { credentials: "same-origin", cache: "no-store" }).then(async (response) => {
      const payload = await response.json().catch(() => null) as { items?: Asset[] } | null;
      if (active && response.ok) setAssets(payload?.items ?? []);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [assetEndpoint, editable]);

  function contentBody(nextAssetIds = assetIds) {
    return props.kind === "highlight"
      ? { title, description, youtubeUrl, thumbnailAssetId: nextAssetIds[0] ?? null, sortOrder: Number(sortOrder) }
      : { title, description, imageAssetIds: nextAssetIds };
  }

  async function send(method: string, body: unknown) {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(endpoint, {
        method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "If-Match": `"${revision}"`, "Idempotency-Key": nextKey() },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null) as { detail?: string; revision?: number; highlight?: HighlightContent; gallery?: GalleryContent } | null;
      if (!response.ok) { setMessage(payload?.detail ?? "요청을 처리하지 못했습니다."); return null; }
      const nextRevision = payload?.revision ?? payload?.highlight?.revision ?? payload?.gallery?.revision;
      if (typeof nextRevision === "number") setRevision(nextRevision);
      return payload;
    } catch { setMessage("네트워크 연결을 확인한 뒤 다시 시도해 주세요."); return null; }
    finally { setBusy(false); }
  }

  async function saveAssets(nextAssetIds: string[]) {
    const payload = await send("PATCH", contentBody(nextAssetIds));
    if (!payload) return;
    setAssetIds(nextAssetIds);
    router.refresh();
  }

  async function upload(file: File | null) {
    if (!file || !assetEndpoint || !editable || busy) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size < 12 || file.size > PRIVATE_ASSET_MAX_BYTES) {
      setMessage("PNG, JPEG, WebP 이미지만 4MiB 이하로 선택해 주세요."); return;
    }
    if (props.kind === "gallery" && assetIds.length >= 5) { setMessage("갤러리는 이미지를 최대 5개까지 연결할 수 있습니다."); return; }
    setBusy(true); setMessage(null);
    try {
      const bytes = await file.arrayBuffer();
      const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
      const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const response = await fetch(assetEndpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": file.type,
          "If-Match": `"${revision}"`,
          "X-Upload-Byte-Size": String(file.size),
          "X-Content-Sha256": sha256,
          "X-Upload-File-Name": encodeURIComponent(file.name),
        },
        body: bytes,
      });
      const payload = await response.json().catch(() => null) as { detail?: string; asset?: Asset } | null;
      if (!response.ok || !payload?.asset) { setMessage(payload?.detail ?? "이미지를 업로드하지 못했습니다."); return; }
      const nextAssetIds = props.kind === "highlight" ? [payload.asset.assetId] : [...assetIds, payload.asset.assetId];
      setAssets((current) => current.some((asset) => asset.assetId === payload.asset!.assetId) ? current : [payload.asset!, ...current]);
      const saved = await send("PATCH", contentBody(nextAssetIds));
      if (saved) { setAssetIds(nextAssetIds); router.refresh(); }
    } catch { setMessage("이미지 검사 또는 업로드 중 오류가 발생했습니다."); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const payload = await send(initial ? "PATCH" : "POST", contentBody());
    if (!payload) return;
    if (!initial) {
      const created = props.kind === "highlight" ? payload.highlight : payload.gallery;
      if (created) router.push(`/admin/${props.kind === "highlight" ? "highlights" : "images"}/${created.id}/edit`);
    } else router.refresh();
  }

  return <form className={styles.form} onSubmit={(event) => void submit(event)}>
    <label>제목<input maxLength={120} required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label>설명<textarea maxLength={4000} required value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    {props.kind === "highlight" ? <div className={styles.split}><label>YouTube 주소<input type="url" required placeholder="https://youtu.be/..." value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} /></label><label>정렬 순서<input type="number" min="-100000" max="100000" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} /></label></div> : null}

    {!initial ? <p className={styles.notice}>먼저 초안을 만드세요. 다음 화면에서 파일을 안전하게 검사하고 바로 연결할 수 있습니다.</p> : <section className={styles.assetPanel} aria-labelledby="asset-heading">
      <div><h2 id="asset-heading">{props.kind === "highlight" ? "썸네일" : `갤러리 이미지 ${assetIds.length}/5`}</h2><p>검사를 통과해 READY가 된 이미지만 초안에 연결됩니다.</p></div>
      {!editable ? <p className={styles.notice}>이미지를 바꾸려면 먼저 게시를 내리거나 보관된 초안을 복구해 주세요.</p> : !props.uploadAvailable ? <p className={styles.error} role="status">운영 비공개 저장소가 아직 연결되지 않아 업로드가 안전하게 닫혀 있습니다.</p> : <label className={styles.filePicker}>파일 선택<input disabled={busy || (props.kind === "gallery" && assetIds.length >= 5)} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void upload(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} /><span>PNG · JPEG · WebP / 최대 4MiB</span></label>}
      {assetIds.length === 0 ? <p className={styles.hint}>아직 연결된 이미지가 없습니다.</p> : <div className={styles.assetList}>{assetIds.map((assetId, index) => {
        const asset = assets.find((candidate) => candidate.assetId === assetId);
        return <article className={styles.assetItem} key={assetId}><div><strong>{props.kind === "highlight" ? "현재 썸네일" : `이미지 ${index + 1}`}</strong><span>{asset ? assetLabel(asset) : "READY 자산"}</span></div>{editable && (props.kind === "highlight" || assetIds.length > 1) ? <button disabled={busy} type="button" onClick={() => void saveAssets(assetIds.filter((id) => id !== assetId))}>연결 해제</button> : null}</article>;
      })}</div>}
      {editable && assets.some((asset) => !assetIds.includes(asset.assetId)) ? <div className={styles.assetSelector}><strong>이 초안의 기존 READY 이미지</strong>{assets.filter((asset) => !assetIds.includes(asset.assetId)).map((asset) => <button disabled={busy || (props.kind === "gallery" && assetIds.length >= 5)} key={asset.assetId} type="button" onClick={() => void saveAssets(props.kind === "highlight" ? [asset.assetId] : [...assetIds, asset.assetId])}><span>{assetLabel(asset)}</span><b>연결</b></button>)}</div> : null}
    </section>}

    <p className={styles.hint}>게시 시 서버가 자산 READY 상태·용도·개수와 최신 revision을 다시 확인합니다.</p>
    {message ? <p className={styles.error} role="alert">{message}</p> : null}
    <div className={styles.actions}><button className={styles.submit} disabled={busy} type="submit">{busy ? "처리 중…" : initial ? "변경 저장" : "초안 만들기"}</button>
      {initial?.status === "DRAFT" ? <button disabled={busy} type="button" onClick={() => void send("PATCH", { action: "PUBLISH" }).then((result) => { if (result) router.refresh(); })}>게시</button> : null}
      {initial?.status === "PUBLISHED" ? <button disabled={busy} type="button" onClick={() => void send("PATCH", { action: "UNPUBLISH" }).then((result) => { if (result) router.refresh(); })}>게시 내리기</button> : null}
      {initial?.status === "ARCHIVED" ? <button disabled={busy} type="button" onClick={() => void send("PATCH", { action: "RESTORE" }).then((result) => { if (result) router.refresh(); })}>draft 복구</button> : null}
      {initial && initial.status !== "ARCHIVED" ? <button className={styles.danger} disabled={busy} type="button" onClick={() => void send("DELETE", {}).then((result) => { if (result) router.push(props.kind === "highlight" ? "/admin/highlights" : "/admin/images"); })}>보관</button> : null}
      {initialGallery?.status === "PUBLISHED" ? <button disabled={busy} type="button" onClick={() => {
        setBusy(true); setMessage(null);
        void fetch(`/api/admin/images/${initialGallery.id}/home-display`, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json", "If-Match": `"${revision}"`, "Idempotency-Key": nextKey() }, body: JSON.stringify({ showOnHome: !initialGallery.showOnHome }) }).then(async (response) => {
          const payload = await response.json().catch(() => null) as { detail?: string; revision?: number } | null;
          if (!response.ok) setMessage(payload?.detail ?? "홈 노출을 변경하지 못했습니다."); else { if (typeof payload?.revision === "number") setRevision(payload.revision); router.refresh(); }
        }).catch(() => setMessage("네트워크 연결을 확인해 주세요.")).finally(() => setBusy(false));
      }}>{initialGallery.showOnHome ? "홈에서 숨기기" : "홈에 표시"}</button> : null}
    </div>
  </form>;
}
