"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import type { GalleryContent, GalleryImageReference, HighlightContent } from "@/modules/media";
import { ResilientMediaImage } from "@/app/(public)/(media)/resilient-media-image";

import styles from "./admin-media.module.css";
import {
  galleryFileProblem,
  galleryFileProblemLabels,
  parseGalleryUploadReport,
  planGalleryFiles,
  type GalleryUploadReport,
} from "./admin-media-upload";

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
  | { kind: "gallery"; initial?: GalleryContent; uploadAvailable: boolean; initialUploadReport?: GalleryUploadNavigationReport };

type MutationPayload = Readonly<{
  detail?: string;
  revision?: number;
  highlight?: HighlightContent;
  gallery?: GalleryContent;
}>;

export type GalleryUploadNavigationReport = Readonly<{
  uploaded: number;
  linked: number;
  failed: number;
}>;

function nextKey() { return globalThis.crypto.randomUUID(); }
function assetLabel(asset: Asset) { return `${asset.width}×${asset.height} · ${(asset.byteSize / 1024).toFixed(0)} KB · ${asset.contentType.replace("image/", "").toUpperCase()}`; }
function galleryUploadReportKey(galleryId: string) { return `klol:gallery-upload-report:${galleryId}`; }
function galleryUploadReportText(report: GalleryUploadReport) {
  const connected = report.linked > 0 ? `${report.linked}장은 갤러리에 연결했습니다.` : report.uploaded > 0 ? `${report.uploaded}장은 READY 자산으로 보관되어 아래에서 다시 연결할 수 있습니다.` : "업로드된 이미지가 없습니다.";
  const failed = report.failedNames.length > 0 ? ` 실패: ${report.failedNames.join(", ")}` : "";
  const attachment = report.attachmentError ? ` 갤러리 연결 실패: ${report.attachmentError}` : "";
  return `${connected}${failed}${attachment}`;
}
function galleryUploadNavigationReportText(report: GalleryUploadNavigationReport) {
  const connected = report.linked > 0 ? `${report.linked}장은 갤러리에 연결했습니다.` : report.uploaded > 0 ? `${report.uploaded}장은 READY 자산으로 보관되어 아래에서 다시 연결할 수 있습니다.` : "업로드된 이미지가 없습니다.";
  const failed = report.failed > 0 ? ` ${report.failed}장은 실패했습니다. 실패한 파일만 다시 선택해 주세요.` : "";
  return `${connected}${failed}`;
}

export function AdminMediaForm(props: Props) {
  const router = useRouter();
  const initial = props.initial;
  const initialHighlight = props.kind === "highlight" ? props.initial : undefined;
  const initialGallery = props.kind === "gallery" ? props.initial : undefined;
  const initialUploadReport = props.kind === "gallery" ? props.initialUploadReport : undefined;
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState(initialHighlight ? `https://www.youtube.com/watch?v=${initialHighlight.youtubeId}` : "");
  const [sortOrder, setSortOrder] = useState(initialHighlight?.sortOrder ?? 0);
  const [assetIds, setAssetIds] = useState<string[]>(initialHighlight?.thumbnailAssetId ? [initialHighlight.thumbnailAssetId] : []);
  const [galleryImages, setGalleryImages] = useState<GalleryImageReference[]>(initialGallery?.imageOrder ? [...initialGallery.imageOrder] : [
    ...(initialGallery?.imageAssetIds ?? []).map((assetId) => ({ kind: "ASSET" as const, assetId })),
    ...(initialGallery?.externalImageUrls ?? []).map((url) => ({ kind: "EXTERNAL" as const, url })),
  ]);
  const [selectedGalleryFiles, setSelectedGalleryFiles] = useState<File[]>([]);
  const [selectionFailures, setSelectionFailures] = useState<string[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [uploadReport, setUploadReport] = useState<string | null>(() => initialUploadReport ? galleryUploadNavigationReportText(initialUploadReport) : null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const base = props.kind === "highlight" ? "/api/admin/highlights" : "/api/admin/images";
  const endpoint = initial ? `${base}/${initial.id}` : base;
  const assetEndpoint = initial ? `${endpoint}/assets` : null;
  const editable = initial?.status === "DRAFT";
  const linkedGalleryAssetIds = galleryImages.flatMap((image) => image.kind === "ASSET" ? [image.assetId] : []);

  useEffect(() => {
    if (!assetEndpoint || !editable) return;
    let active = true;
    void fetch(assetEndpoint, { credentials: "same-origin", cache: "no-store" }).then(async (response) => {
      const payload = await response.json().catch(() => null) as { items?: Asset[] } | null;
      if (active && response.ok) setAssets(payload?.items ?? []);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [assetEndpoint, editable]);

  useEffect(() => {
    if (!initialGallery?.id) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const key = galleryUploadReportKey(initialGallery.id);
      const stored = globalThis.sessionStorage.getItem(key);
      globalThis.sessionStorage.removeItem(key);
      const detailedReport = parseGalleryUploadReport(stored);
      if (detailedReport) timer = setTimeout(() => setUploadReport(galleryUploadReportText(detailedReport)), 0);
    } catch { /* Browser storage restrictions must not hide the editor. */ }
    return () => { if (timer) clearTimeout(timer); };
  }, [initialGallery?.id]);

  function contentBody(nextAssetIds = assetIds, nextGalleryImages = galleryImages) {
    return props.kind === "highlight"
      ? { title, description, youtubeUrl, thumbnailAssetId: nextAssetIds[0] ?? null, sortOrder: Number(sortOrder) }
      : {
        title,
        description,
        imageAssetIds: nextGalleryImages.flatMap((image) => image.kind === "ASSET" ? [image.assetId] : []),
        externalImageUrls: nextGalleryImages.flatMap((image) => image.kind === "EXTERNAL" ? [image.url] : []),
        imageOrder: nextGalleryImages,
      };
  }

  async function requestMutation(target: string, method: string, body: unknown, expectedRevision: number) {
    try {
      const response = await fetch(target, {
        method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "If-Match": `"${expectedRevision}"`, "Idempotency-Key": nextKey() },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null) as MutationPayload | null;
      if (!response.ok) return { ok: false as const, detail: payload?.detail ?? "요청을 처리하지 못했습니다." };
      return { ok: true as const, payload };
    } catch { return { ok: false as const, detail: "네트워크 연결을 확인한 뒤 다시 시도해 주세요." }; }
  }

  async function send(method: string, body: unknown) {
    setBusy(true); setMessage(null); setUploadReport(null);
    try {
      const result = await requestMutation(endpoint, method, body, revision);
      if (!result.ok) { setMessage(result.detail); return null; }
      const payload = result.payload;
      const nextRevision = payload?.revision ?? payload?.highlight?.revision ?? payload?.gallery?.revision;
      if (typeof nextRevision === "number") setRevision(nextRevision);
      return payload;
    } finally { setBusy(false); }
  }

  async function saveAssets(nextAssetIds: string[]) {
    const payload = await send("PATCH", contentBody(nextAssetIds));
    if (!payload) return;
    setAssetIds(nextAssetIds);
    router.refresh();
  }

  async function saveGalleryImages(nextImages: GalleryImageReference[]) {
    const payload = await send("PATCH", contentBody(assetIds, nextImages));
    if (!payload) return;
    setGalleryImages(nextImages);
    router.refresh();
  }

  function moveGalleryImage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= galleryImages.length) return;
    const next = [...galleryImages];
    [next[index], next[target]] = [next[target]!, next[index]!];
    void saveGalleryImages(next);
  }

  async function uploadAsset(file: File, targetAssetEndpoint: string, expectedRevision: number) {
    const invalid = galleryFileProblem(file);
    if (invalid) return { ok: false as const, detail: invalid };
    try {
      const bytes = await file.arrayBuffer();
      const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
      const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const response = await fetch(targetAssetEndpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": file.type,
          "If-Match": `"${expectedRevision}"`,
          "X-Upload-Byte-Size": String(file.size),
          "X-Content-Sha256": sha256,
          "X-Upload-File-Name": encodeURIComponent(file.name),
        },
        body: bytes,
      });
      const payload = await response.json().catch(() => null) as { detail?: string; asset?: Asset } | null;
      if (!response.ok || !payload?.asset) return { ok: false as const, detail: payload?.detail ?? "이미지를 업로드하지 못했습니다." };
      return { ok: true as const, asset: payload.asset };
    } catch { return { ok: false as const, detail: "이미지 검사 또는 업로드 중 오류가 발생했습니다." }; }
  }

  async function uploadGalleryBatch(files: readonly File[], targetAssetEndpoint: string, targetEndpoint: string, expectedRevision: number, startingImages: readonly GalleryImageReference[]) {
    const uploaded: Asset[] = [];
    const failedNames: string[] = [];
    for (const [index, file] of files.entries()) {
      setUploadProgress(`${index + 1}/${files.length} · ${file.name} 업로드 중`);
      const result = await uploadAsset(file, targetAssetEndpoint, expectedRevision);
      if (result.ok) uploaded.push(result.asset);
      else failedNames.push(`${file.name} (${result.detail})`);
    }
    setUploadProgress(null);
    if (uploaded.length === 0) return { report: { uploaded: 0, linked: 0, failedNames } satisfies GalleryUploadReport, assets: uploaded, images: [...startingImages] };

    const nextImages: GalleryImageReference[] = [
      ...startingImages,
      ...uploaded.map((asset) => ({ kind: "ASSET" as const, assetId: asset.assetId })),
    ];
    const attached = await requestMutation(targetEndpoint, "PATCH", contentBody(assetIds, nextImages), expectedRevision);
    if (!attached.ok) {
      return { report: { uploaded: uploaded.length, linked: 0, failedNames, attachmentError: attached.detail } satisfies GalleryUploadReport, assets: uploaded, images: [...startingImages] };
    }
    const nextRevision = attached.payload?.revision ?? attached.payload?.gallery?.revision;
    if (typeof nextRevision === "number") setRevision(nextRevision);
    return { report: { uploaded: uploaded.length, linked: uploaded.length, failedNames } satisfies GalleryUploadReport, assets: uploaded, images: nextImages };
  }

  async function uploadSelectedFiles(files: readonly File[]) {
    if (!assetEndpoint || !editable || busy || files.length === 0) return;
    const remaining = 5 - galleryImages.length;
    if (remaining <= 0) { setMessage("갤러리는 이미지를 최대 5개까지 연결할 수 있습니다."); return; }
    const planned = planGalleryFiles(files, remaining);
    const rejected = galleryFileProblemLabels(planned.rejected);
    if (planned.accepted.length === 0) {
      setMessage(null);
      setUploadReport(galleryUploadReportText({ uploaded: 0, linked: 0, failedNames: rejected }));
      return;
    }
    setBusy(true); setMessage(null); setUploadReport(null);
    try {
      const result = await uploadGalleryBatch(planned.accepted, assetEndpoint, endpoint, revision, galleryImages);
      const report = { ...result.report, failedNames: [...rejected, ...result.report.failedNames] };
      setAssets((current) => [...result.assets.filter((asset) => !current.some((item) => item.assetId === asset.assetId)), ...current]);
      setGalleryImages(result.images);
      setUploadReport(galleryUploadReportText(report));
      router.refresh();
    } finally { setUploadProgress(null); setBusy(false); }
  }

  async function uploadHighlight(file: File | null) {
    if (!file || !assetEndpoint || !editable || busy) return;
    setBusy(true); setMessage(null); setUploadReport(null);
    try {
      const result = await uploadAsset(file, assetEndpoint, revision);
      if (!result.ok) { setMessage(result.detail); return; }
      const nextAssetIds = [result.asset.assetId];
      setAssets((current) => current.some((asset) => asset.assetId === result.asset.assetId) ? current : [result.asset, ...current]);
      const saved = await requestMutation(endpoint, "PATCH", contentBody(nextAssetIds, galleryImages), revision);
      if (!saved.ok) { setMessage(saved.detail); return; }
      const nextRevision = saved.payload?.revision ?? saved.payload?.highlight?.revision;
      if (typeof nextRevision === "number") setRevision(nextRevision);
      setAssetIds(nextAssetIds);
      router.refresh();
    } finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!initial && props.kind === "gallery") {
      setBusy(true); setMessage(null); setUploadReport(null);
      try {
        const createdResult = await requestMutation(base, "POST", contentBody(assetIds, []), revision);
        if (!createdResult.ok) { setMessage(createdResult.detail); return; }
        const created = createdResult.payload?.gallery;
        if (!created) { setMessage("초안 생성 결과를 확인하지 못했습니다."); return; }

        let report: GalleryUploadReport = { uploaded: 0, linked: 0, failedNames: selectionFailures };
        if (selectedGalleryFiles.length > 0) {
          const result = await uploadGalleryBatch(selectedGalleryFiles, `${base}/${created.id}/assets`, `${base}/${created.id}`, created.revision, []);
          report = { ...result.report, failedNames: [...selectionFailures, ...result.report.failedNames] };
        }
        if (selectedGalleryFiles.length > 0 || selectionFailures.length > 0) {
          try { globalThis.sessionStorage.setItem(galleryUploadReportKey(created.id), JSON.stringify(report)); } catch { /* Count-only fallback remains available. */ }
        }
        const query = selectedGalleryFiles.length > 0 || selectionFailures.length > 0
          ? `?uploaded=${report.uploaded}&linked=${report.linked}&failed=${Math.min(5, report.failedNames.length)}`
          : "";
        router.push(`/admin/images/${created.id}/edit${query}`);
      } finally { setUploadProgress(null); setBusy(false); }
      return;
    }
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

    {!initial ? props.kind === "highlight" ? <p className={styles.notice}>먼저 초안을 만드세요. 다음 화면에서 파일을 안전하게 검사하고 바로 연결할 수 있습니다.</p> : <section className={styles.assetPanel} aria-labelledby="new-gallery-asset-heading">
      <div><h2 id="new-gallery-asset-heading">이미지 한 번에 등록</h2><p>최대 5장을 선택하면 초안 생성, 안전 검사, READY 전환, 갤러리 연결을 순서대로 처리합니다.</p></div>
      {!props.uploadAvailable ? <p className={styles.error} role="status">운영 비공개 저장소가 아직 연결되지 않아 업로드가 안전하게 닫혀 있습니다.</p> : <label className={styles.filePicker}>이미지 선택<input aria-describedby="new-gallery-file-help" disabled={busy} multiple type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
        const files = [...(event.currentTarget.files ?? [])];
        const planned = planGalleryFiles(files, 5);
        const rejected = galleryFileProblemLabels(planned.rejected);
        setSelectedGalleryFiles(planned.accepted);
        setSelectionFailures(rejected);
        setMessage(null);
        setUploadReport(rejected.length > 0 ? `선택 제외: ${rejected.join(", ")}` : null);
        event.currentTarget.value = "";
      }} /><span id="new-gallery-file-help">PNG · JPEG · WebP / 장당 최대 4MiB / 최대 5장</span></label>}
      {selectedGalleryFiles.length === 0 ? <p className={styles.hint}>이미지를 선택하지 않아도 빈 초안을 만들 수 있습니다.</p> : <ol className={styles.selectedFiles} aria-label="등록할 이미지 순서">{selectedGalleryFiles.map((file, index) => <li key={`${file.name}:${file.size}:${file.lastModified}:${index}`}><span><strong>{index + 1}. {file.name}</strong><small>{(file.size / 1024).toFixed(0)} KB</small></span><button aria-label={`${file.name} 선택 취소`} disabled={busy} type="button" onClick={() => setSelectedGalleryFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>선택 취소</button></li>)}</ol>}
      <p className={styles.hint}>선택 순서가 공개 갤러리 표시 순서가 됩니다. 일부 파일이 실패해도 성공한 파일은 READY 자산으로 보존합니다.</p>
    </section> : <section className={styles.assetPanel} aria-labelledby="asset-heading">
      <div><h2 id="asset-heading">{props.kind === "highlight" ? "썸네일" : `갤러리 이미지 ${galleryImages.length}/5`}</h2><p>{props.kind === "gallery" ? "비공개 자산과 이관된 외부 이미지는 아래 표시 순서를 함께 사용합니다." : "검사를 통과해 READY가 된 이미지만 초안에 연결됩니다."}</p></div>
      {!editable ? <p className={styles.notice}>이미지를 바꾸려면 먼저 게시를 내리거나 보관된 초안을 복구해 주세요.</p> : !props.uploadAvailable ? <p className={styles.error} role="status">운영 비공개 저장소가 아직 연결되지 않아 업로드가 안전하게 닫혀 있습니다.</p> : <label className={styles.filePicker}>{props.kind === "gallery" ? "이미지 여러 장 선택" : "파일 선택"}<input disabled={busy || (props.kind === "gallery" && galleryImages.length >= 5)} multiple={props.kind === "gallery"} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
        const files = [...(event.currentTarget.files ?? [])];
        event.currentTarget.value = "";
        if (props.kind === "gallery") void uploadSelectedFiles(files);
        else void uploadHighlight(files[0] ?? null);
      }} /><span>PNG · JPEG · WebP / 장당 최대 4MiB{props.kind === "gallery" ? ` / ${5 - galleryImages.length}장 추가 가능` : ""}</span></label>}
      {props.kind === "highlight" ? assetIds.length === 0 ? <p className={styles.hint}>아직 연결된 이미지가 없습니다.</p> : <div className={styles.assetList}>{assetIds.map((assetId) => {
        const asset = assets.find((candidate) => candidate.assetId === assetId);
        return <article className={styles.assetItem} key={assetId}><div><strong>현재 썸네일</strong><span>{asset ? assetLabel(asset) : "READY 자산"}</span></div>{editable ? <button disabled={busy} type="button" onClick={() => void saveAssets([])}>연결 해제</button> : null}</article>;
      })}</div> : galleryImages.length === 0 ? <p className={styles.hint}>아직 연결된 이미지가 없습니다.</p> : <div className={styles.assetList}>{galleryImages.map((image, index) => {
        const asset = image.kind === "ASSET" ? assets.find((candidate) => candidate.assetId === image.assetId) : undefined;
        const key = image.kind === "ASSET" ? `asset:${image.assetId}` : `external:${image.url}`;
        const url = image.kind === "ASSET" ? `/api/admin/private-assets/${image.assetId}` : image.url;
        return <article className={styles.assetItem} key={key}><div className={styles.assetPreview}><ResilientMediaImage sizes="96px" src={url} alt={`${title || "갤러리"} ${index + 1}번째 이미지`} /></div><div><strong>이미지 {index + 1} · {image.kind === "ASSET" ? "비공개 자산" : "이관 외부 이미지"}</strong><span>{asset ? assetLabel(asset) : image.kind === "ASSET" ? "READY 자산" : image.url}</span></div>{editable ? <div className={styles.orderActions}><button aria-label={`${index + 1}번째 이미지 위로`} disabled={busy || index === 0} type="button" onClick={() => moveGalleryImage(index, -1)}>↑</button><button aria-label={`${index + 1}번째 이미지 아래로`} disabled={busy || index === galleryImages.length - 1} type="button" onClick={() => moveGalleryImage(index, 1)}>↓</button><button disabled={busy} type="button" onClick={() => void saveGalleryImages(galleryImages.filter((_, itemIndex) => itemIndex !== index))}>삭제</button></div> : null}</article>;
      })}</div>}
      {editable && assets.some((asset) => props.kind === "highlight" ? !assetIds.includes(asset.assetId) : !linkedGalleryAssetIds.includes(asset.assetId)) ? <div className={styles.assetSelector}><strong>이 초안의 기존 READY 이미지</strong>{assets.filter((asset) => props.kind === "highlight" ? !assetIds.includes(asset.assetId) : !linkedGalleryAssetIds.includes(asset.assetId)).map((asset) => <button disabled={busy || (props.kind === "gallery" && galleryImages.length >= 5)} key={asset.assetId} type="button" onClick={() => props.kind === "highlight" ? void saveAssets([asset.assetId]) : void saveGalleryImages([...galleryImages, { kind: "ASSET", assetId: asset.assetId }])}><span>{assetLabel(asset)}</span><b>연결</b></button>)}</div> : null}
    </section>}

    <p className={styles.hint}>게시 시 서버가 자산 READY 상태·용도·개수와 최신 revision을 다시 확인합니다.</p>
    {uploadProgress ? <p className={styles.notice} aria-live="polite" role="status">{uploadProgress}</p> : null}
    {uploadReport ? <p className={styles.notice} aria-live="polite" role="status">{uploadReport}</p> : null}
    {message ? <p className={styles.error} role="alert">{message}</p> : null}
    <div className={styles.actions}><button className={styles.submit} disabled={busy} type="submit">{busy ? uploadProgress ?? "처리 중…" : initial ? "변경 저장" : props.kind === "gallery" && selectedGalleryFiles.length > 0 ? `초안 만들고 ${selectedGalleryFiles.length}장 등록` : "초안 만들기"}</button>
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
