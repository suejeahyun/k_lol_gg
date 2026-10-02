import "server-only";

import type { MetadataRoute } from "next";

import { loadRuntimeDestruction } from "@/modules/competitions/destruction/runtime-destruction";
import { loadRuntimeEvent } from "@/modules/competitions/events/infrastructure/runtime-event";
import { loadRuntimeMatchData } from "@/modules/matches/infrastructure/runtime-match-data";
import { loadRuntimeMedia } from "@/modules/media/infrastructure/runtime-media";
import { loadRuntimePlayerCatalog } from "@/modules/players/infrastructure/runtime-player-data";

import { absoluteSiteUrl, routeSeoContract } from "../domain/site-seo";

type DynamicSitemapEntry = MetadataRoute.Sitemap[number];

// 단일 sitemap의 50,000 URL 제한 아래에서 정적 경로 여유분을 남긴다.
export const MAX_DYNAMIC_URLS_PER_COLLECTION = 7_500;

function sitemapEntry(template: string, pathname: string): DynamicSitemapEntry {
  const contract = routeSeoContract(template);
  return {
    url: absoluteSiteUrl(pathname),
    changeFrequency: contract.changeFrequency,
    priority: contract.priority,
  };
}

async function playerEntries(): Promise<readonly DynamicSitemapEntry[]> {
  const entries: DynamicSitemapEntry[] = [];
  for (let page = 1; entries.length < MAX_DYNAMIC_URLS_PER_COLLECTION; page += 1) {
    const result = await loadRuntimePlayerCatalog({ query: "", tier: null, page, pageSize: 50 });
    if (result.state !== "ready") break;
    entries.push(...result.data.items.map((item) => sitemapEntry("/players/[playerId]", `/players/${item.id}`)));
    if (page >= result.data.totalPages || result.data.items.length === 0) break;
  }
  return entries.slice(0, MAX_DYNAMIC_URLS_PER_COLLECTION);
}

async function matchEntries(): Promise<readonly DynamicSitemapEntry[]> {
  const entries: DynamicSitemapEntry[] = [];
  for (let page = 1; entries.length < MAX_DYNAMIC_URLS_PER_COLLECTION; page += 1) {
    const result = await loadRuntimeMatchData((service) => service.listPublic({
      sort: "playedOn",
      order: "desc",
      page,
      pageSize: 50,
    }));
    if (result.state !== "ready") break;
    entries.push(...result.data.items.map((item) => sitemapEntry("/matches/[matchId]", `/matches/${item.id}`)));
    if (page >= result.data.totalPages || result.data.items.length === 0) break;
  }
  return entries.slice(0, MAX_DYNAMIC_URLS_PER_COLLECTION);
}

async function eventEntries(): Promise<readonly DynamicSitemapEntry[]> {
  const entries: DynamicSitemapEntry[] = [];
  for (let page = 1; entries.length < MAX_DYNAMIC_URLS_PER_COLLECTION; page += 1) {
    const result = await loadRuntimeEvent(({ repository }) => repository.listPublic({ query: "", status: null, format: null, page, pageSize: 48 }, new Date()));
    if (result.state !== "ready") break;
    entries.push(...result.data.items.map((item) => sitemapEntry("/competitions/events/[eventId]", `/competitions/events/${item.id}`)));
    if (page >= result.data.totalPages || result.data.items.length === 0) break;
  }
  return entries.slice(0, MAX_DYNAMIC_URLS_PER_COLLECTION);
}

async function destructionEntries(): Promise<readonly DynamicSitemapEntry[]> {
  const entries: DynamicSitemapEntry[] = [];
  for (let page = 1; entries.length < MAX_DYNAMIC_URLS_PER_COLLECTION; page += 1) {
    const result = await loadRuntimeDestruction(({ repository }) => repository.listPublic({ query: "", status: null, format: null, page, pageSize: 48 }));
    if (result.state !== "ready") break;
    entries.push(...result.data.items.map((item) => sitemapEntry("/competitions/destruction/[tournamentId]", `/competitions/destruction/${item.id}`)));
    if (page >= result.data.totalPages || result.data.items.length === 0) break;
  }
  return entries.slice(0, MAX_DYNAMIC_URLS_PER_COLLECTION);
}

async function mediaEntries(kind: "highlight" | "gallery"): Promise<readonly DynamicSitemapEntry[]> {
  const entries: DynamicSitemapEntry[] = [];
  let cursor: string | null = null;
  const seenCursors = new Set<string>();
  while (entries.length < MAX_DYNAMIC_URLS_PER_COLLECTION) {
    const result = kind === "highlight"
      ? await loadRuntimeMedia((service) => service.listPublicHighlights({ pageSize: 24, cursor }))
      : await loadRuntimeMedia((service) => service.listPublicGalleries({ pageSize: 24, cursor }));
    if (result.state !== "ready") break;
    const template = kind === "highlight" ? "/highlights/[highlightId]" : "/images/[imageId]";
    const root = kind === "highlight" ? "/highlights" : "/images";
    entries.push(...result.data.items.map((item) => sitemapEntry(template, `${root}/${item.id}`)));
    const nextCursor = result.data.nextCursor;
    if (!nextCursor || seenCursors.has(nextCursor) || result.data.items.length === 0) break;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
  return entries.slice(0, MAX_DYNAMIC_URLS_PER_COLLECTION);
}

export async function loadRuntimeSitemapEntries(): Promise<readonly DynamicSitemapEntry[]> {
  const collections = await Promise.all([
    playerEntries(),
    matchEntries(),
    eventEntries(),
    destructionEntries(),
    mediaEntries("highlight"),
    mediaEntries("gallery"),
  ]);
  const unique = new Map<string, DynamicSitemapEntry>();
  for (const entry of collections.flat()) unique.set(entry.url, entry);
  return [...unique.values()];
}
