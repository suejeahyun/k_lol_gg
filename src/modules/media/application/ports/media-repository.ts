import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";

import type { GalleryContent, HighlightContent, MediaPublicationStatus } from "../../domain/media-content";

export type MediaCommandEnvelope = Readonly<{
  actorUserAccountId: string;
  actorSession: TransactionSessionActor;
  requestId: string;
  scope: string;
  keyHash: Buffer;
  requestHash: Buffer;
}>;

export type MediaMutationResult = Readonly<{
  body: Record<string, unknown>;
  status: number;
  revision: number;
  replayed: boolean;
}>;

export type MediaPublicListQuery = Readonly<{
  pageSize: number;
  cursor: string | null;
}>;

export type MediaAdminListQuery = Readonly<{
  page: number;
  pageSize: number;
  status: MediaPublicationStatus | null;
}>;

export type MediaPublicHighlightList = Readonly<{
  items: readonly HighlightContent[];
  nextCursor: string | null;
}>;

export type MediaPublicGalleryList = Readonly<{
  items: readonly GalleryContent[];
  nextCursor: string | null;
}>;

export type MediaAdminList<T> = Readonly<{
  items: readonly T[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
}>;

export type CreateHighlightInput = Readonly<Omit<HighlightContent, "id" | "revision" | "status">>;
export type CreateGalleryInput = Readonly<Omit<GalleryContent, "id" | "revision" | "status" | "showOnHome">>;

export interface MediaRepository {
  listPublicHighlights(query: MediaPublicListQuery): Promise<MediaPublicHighlightList>;
  getPublicHighlight(id: string): Promise<HighlightContent | null>;
  listPublicGalleries(query: MediaPublicListQuery): Promise<MediaPublicGalleryList>;
  getPublicGallery(id: string): Promise<GalleryContent | null>;
  listAdminHighlights(query: MediaAdminListQuery): Promise<MediaAdminList<HighlightContent>>;
  getAdminHighlight(id: string): Promise<HighlightContent | null>;
  listAdminGalleries(query: MediaAdminListQuery): Promise<MediaAdminList<GalleryContent>>;
  getAdminGallery(id: string): Promise<GalleryContent | null>;
  createHighlight(envelope: MediaCommandEnvelope, input: CreateHighlightInput, now: Date): Promise<MediaMutationResult>;
  updateHighlight(envelope: MediaCommandEnvelope, id: string, expectedRevision: number, input: CreateHighlightInput, now: Date): Promise<MediaMutationResult>;
  transitionHighlight(envelope: MediaCommandEnvelope, id: string, expectedRevision: number, command: "PUBLISH" | "UNPUBLISH" | "ARCHIVE" | "RESTORE", now: Date): Promise<MediaMutationResult>;
  createGallery(envelope: MediaCommandEnvelope, input: CreateGalleryInput, now: Date): Promise<MediaMutationResult>;
  updateGallery(envelope: MediaCommandEnvelope, id: string, expectedRevision: number, input: CreateGalleryInput, now: Date): Promise<MediaMutationResult>;
  transitionGallery(envelope: MediaCommandEnvelope, id: string, expectedRevision: number, command: "PUBLISH" | "UNPUBLISH" | "ARCHIVE" | "RESTORE", now: Date): Promise<MediaMutationResult>;
  setGalleryHomeDisplay(envelope: MediaCommandEnvelope, id: string, expectedRevision: number, showOnHome: boolean, now: Date): Promise<MediaMutationResult>;
}
