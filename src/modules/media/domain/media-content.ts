export type MediaPublicationStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type HighlightContent = Readonly<{
  id: string;
  revision: number;
  title: string;
  description: string;
  youtubeId: string;
  thumbnailAssetId: string | null;
  legacyThumbnailUrl?: string | null;
  status: MediaPublicationStatus;
  sortOrder: number;
}>;

export type GalleryContent = Readonly<{
  id: string;
  revision: number;
  title: string;
  description: string;
  imageAssetIds: readonly string[];
  externalImageUrls?: readonly string[];
  showOnHome: boolean;
  status: MediaPublicationStatus;
}>;

export type PublicHighlightDto = Readonly<{
  id: string;
  title: string;
  description: string;
  youtubeId: string;
  youtubeWatchUrl: string;
  thumbnailUrl: string;
}>;

export type PublicGalleryDto = Readonly<{
  id: string;
  title: string;
  description: string;
  images: readonly Readonly<{ assetId: string; url: string }>[];
  showOnHome: boolean;
}>;

export type MediaAssetUrlResolver = (assetId: string) => string;

function normalizedText(value: string, field: string, maximum: number): string {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || normalized.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) {
    throw new Error(`INVALID_${field}`);
  }
  return normalized;
}

function identifier(value: string, field: string): string {
  const normalized = normalizedText(value, field, 200);
  if (/[/\\?#]/.test(normalized)) throw new Error(`INVALID_${field}`);
  return normalized;
}

function revision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("INVALID_MEDIA_REVISION");
  return value;
}

function sortOrder(value: number): number {
  if (!Number.isSafeInteger(value) || value < -100_000 || value > 100_000) {
    throw new Error("INVALID_MEDIA_SORT_ORDER");
  }
  return value;
}

function youtubeId(value: string): string {
  if (!/^[A-Za-z0-9_-]{11}$/.test(value)) throw new Error("INVALID_YOUTUBE_ID");
  return value;
}

export function extractYoutubeId(value: string): string {
  const raw = value.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("INVALID_YOUTUBE_URL");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) {
    throw new Error("INVALID_YOUTUBE_URL");
  }
  const host = parsed.hostname.toLowerCase();
  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = parsed.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (host === "www.youtube.com" || host === "youtube.com" || host === "m.youtube.com") {
    if (parsed.pathname === "/watch") candidate = parsed.searchParams.get("v");
    else if (parsed.pathname.startsWith("/shorts/") || parsed.pathname.startsWith("/embed/")) {
      candidate = parsed.pathname.split("/").filter(Boolean)[1] ?? null;
    }
  }
  if (!candidate) throw new Error("INVALID_YOUTUBE_URL");
  return youtubeId(candidate);
}

export function createHighlight(input: Readonly<{
  id: string;
  title: string;
  description: string;
  youtubeUrl: string;
  thumbnailAssetId?: string | null;
  publish?: boolean;
  sortOrder?: number;
}>): HighlightContent {
  return {
    id: identifier(input.id, "HIGHLIGHT_ID"),
    revision: 0,
    title: normalizedText(input.title, "HIGHLIGHT_TITLE", 120),
    description: normalizedText(input.description, "HIGHLIGHT_DESCRIPTION", 4_000),
    youtubeId: extractYoutubeId(input.youtubeUrl),
    thumbnailAssetId: input.thumbnailAssetId ? identifier(input.thumbnailAssetId, "THUMBNAIL_ASSET_ID") : null,
    status: input.publish ? "PUBLISHED" : "DRAFT",
    sortOrder: sortOrder(input.sortOrder ?? 0),
  };
}

export function createGallery(input: Readonly<{
  id: string;
  title: string;
  description: string;
  imageAssetIds: readonly string[];
  showOnHome?: boolean;
  publish?: boolean;
  allowEmptyDraft?: boolean;
}>): GalleryContent {
  if (
    input.imageAssetIds.length > 5 ||
    (input.imageAssetIds.length < 1 && (!input.allowEmptyDraft || input.publish))
  ) {
    throw new Error("INVALID_GALLERY_IMAGE_COUNT");
  }
  const imageAssetIds = input.imageAssetIds.map((assetId) => identifier(assetId, "GALLERY_ASSET_ID"));
  if (new Set(imageAssetIds).size !== imageAssetIds.length) throw new Error("DUPLICATE_GALLERY_ASSET");
  const status: MediaPublicationStatus = input.publish ? "PUBLISHED" : "DRAFT";
  return {
    id: identifier(input.id, "GALLERY_ID"),
    revision: 0,
    title: normalizedText(input.title, "GALLERY_TITLE", 120),
    description: normalizedText(input.description, "GALLERY_DESCRIPTION", 4_000),
    imageAssetIds,
    showOnHome: status === "PUBLISHED" && Boolean(input.showOnHome),
    status,
  };
}

export function updateHighlight(input: Readonly<{
  highlight: HighlightContent;
  expectedRevision: number;
  title: string;
  description: string;
  youtubeUrl: string;
  thumbnailAssetId: string | null;
  sortOrder: number;
}>): HighlightContent {
  revision(input.expectedRevision);
  if (input.highlight.revision !== input.expectedRevision) throw new Error("STALE_MEDIA_REVISION");
  if (input.highlight.status === "ARCHIVED") throw new Error("ARCHIVED_MEDIA_READ_ONLY");
  const validated = createHighlight({
    id: input.highlight.id,
    title: input.title,
    description: input.description,
    youtubeUrl: input.youtubeUrl,
    thumbnailAssetId: input.thumbnailAssetId,
    sortOrder: input.sortOrder,
  });
  return { ...input.highlight, ...validated, revision: input.highlight.revision + 1, status: input.highlight.status };
}

export function updateGallery(input: Readonly<{
  gallery: GalleryContent;
  expectedRevision: number;
  title: string;
  description: string;
  imageAssetIds: readonly string[];
}>): GalleryContent {
  revision(input.expectedRevision);
  if (input.gallery.revision !== input.expectedRevision) throw new Error("STALE_MEDIA_REVISION");
  if (input.gallery.status === "ARCHIVED") throw new Error("ARCHIVED_MEDIA_READ_ONLY");
  if (input.imageAssetIds.length + (input.gallery.externalImageUrls?.length ?? 0) > 5) {
    throw new Error("INVALID_GALLERY_IMAGE_COUNT");
  }
  const validated = createGallery({
    id: input.gallery.id,
    title: input.title,
    description: input.description,
    imageAssetIds: input.imageAssetIds,
    allowEmptyDraft: (input.gallery.externalImageUrls?.length ?? 0) > 0,
  });
  return {
    ...input.gallery,
    title: validated.title,
    description: validated.description,
    imageAssetIds: validated.imageAssetIds,
    revision: input.gallery.revision + 1,
  };
}

export function transitionMediaStatus<T extends HighlightContent | GalleryContent>(input: Readonly<{
  content: T;
  expectedRevision: number;
  command: "PUBLISH" | "UNPUBLISH" | "ARCHIVE" | "RESTORE";
}>): T {
  revision(input.expectedRevision);
  if (input.content.revision !== input.expectedRevision) throw new Error("STALE_MEDIA_REVISION");
  if (
    input.command === "PUBLISH" &&
    "imageAssetIds" in input.content &&
    (
      input.content.imageAssetIds.length + (input.content.externalImageUrls?.length ?? 0) < 1 ||
      input.content.imageAssetIds.length + (input.content.externalImageUrls?.length ?? 0) > 5
    )
  ) {
    throw new Error("INVALID_GALLERY_IMAGE_COUNT");
  }
  const allowed: Record<MediaPublicationStatus, Partial<Record<typeof input.command, MediaPublicationStatus>>> = {
    DRAFT: { PUBLISH: "PUBLISHED", ARCHIVE: "ARCHIVED" },
    PUBLISHED: { UNPUBLISH: "DRAFT", ARCHIVE: "ARCHIVED" },
    ARCHIVED: { RESTORE: "DRAFT" },
  };
  const status = allowed[input.content.status][input.command];
  if (!status) throw new Error("INVALID_MEDIA_TRANSITION");
  return {
    ...input.content,
    revision: input.content.revision + 1,
    status,
    ...(status !== "PUBLISHED" && "showOnHome" in input.content ? { showOnHome: false } : {}),
  };
}

export function setGalleryHomeDisplay(input: Readonly<{
  gallery: GalleryContent;
  expectedRevision: number;
  showOnHome: boolean;
}>): GalleryContent {
  revision(input.expectedRevision);
  if (input.gallery.revision !== input.expectedRevision) throw new Error("STALE_MEDIA_REVISION");
  if (input.gallery.status !== "PUBLISHED" && input.showOnHome) {
    throw new Error("UNPUBLISHED_GALLERY_CANNOT_SHOW_ON_HOME");
  }
  return { ...input.gallery, revision: input.gallery.revision + 1, showOnHome: input.showOnHome };
}

export function toPublicHighlightDto(
  content: HighlightContent,
  resolveAssetUrl: MediaAssetUrlResolver,
): PublicHighlightDto {
  if (content.status !== "PUBLISHED") throw new Error("HIGHLIGHT_NOT_PUBLIC");
  return {
    id: content.id,
    title: content.title,
    description: content.description,
    youtubeId: content.youtubeId,
    youtubeWatchUrl: `https://www.youtube.com/watch?v=${content.youtubeId}`,
    thumbnailUrl: content.thumbnailAssetId
      ? resolveAssetUrl(content.thumbnailAssetId)
      : content.legacyThumbnailUrl ?? `https://i.ytimg.com/vi/${content.youtubeId}/hqdefault.jpg`,
  };
}

export function toPublicGalleryDto(
  content: GalleryContent,
  resolveAssetUrl: MediaAssetUrlResolver,
): PublicGalleryDto {
  if (content.status !== "PUBLISHED") throw new Error("GALLERY_NOT_PUBLIC");
  return {
    id: content.id,
    title: content.title,
    description: content.description,
    images: [
      ...content.imageAssetIds.map((assetId) => ({ assetId, url: resolveAssetUrl(assetId) })),
      ...(content.externalImageUrls ?? []).map((url, ordinal) => ({
        assetId: `external:${content.id}:${ordinal}`,
        url,
      })),
    ],
    showOnHome: content.showOnHome,
  };
}
