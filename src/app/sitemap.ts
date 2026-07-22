import type { MetadataRoute } from "next";

import { getPublicBaseUrl } from "@/lib/http/base-url";
import { prisma } from "@/lib/prisma/client";
import { logServerError } from "@/lib/server/safe-log";

export const revalidate = 3600;
export const dynamic = "force-dynamic";

// Sitemap protocol limit is 50,000 URLs per file. Six dynamic groups plus
// static routes stay below that ceiling even when every group reaches its cap.
const MAX_DYNAMIC_ENTRIES_PER_TYPE = 8_000;

const publicRoutes = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/players", changeFrequency: "daily", priority: 0.9 },
  { path: "/rankings", changeFrequency: "daily", priority: 0.9 },
  { path: "/matches", changeFrequency: "daily", priority: 0.9 },
  { path: "/recruit", changeFrequency: "hourly", priority: 0.8 },
  { path: "/progress", changeFrequency: "daily", priority: 0.8 },
  { path: "/progress/destruction", changeFrequency: "daily", priority: 0.7 },
  { path: "/progress/event", changeFrequency: "daily", priority: 0.7 },
  { path: "/highlights", changeFrequency: "weekly", priority: 0.7 },
  { path: "/images", changeFrequency: "weekly", priority: 0.7 },
  { path: "/kakao", changeFrequency: "monthly", priority: 0.6 },
  { path: "/recruit-helper", changeFrequency: "monthly", priority: 0.5 },
  { path: "/riot-api", changeFrequency: "monthly", priority: 0.6 },
  { path: "/coin-toss", changeFrequency: "monthly", priority: 0.5 },
  { path: "/random-team", changeFrequency: "monthly", priority: 0.5 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.2 },
] as const satisfies ReadonlyArray<{
  path: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  priority: number;
}>;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getPublicBaseUrl();
  const lastModified = new Date();

  const staticEntries: MetadataRoute.Sitemap = publicRoutes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  let dynamicEntries: Awaited<ReturnType<typeof loadDynamicEntries>>;
  try {
    dynamicEntries = await loadDynamicEntries();
  } catch (error) {
    logServerError("[SITEMAP_DYNAMIC_URL_ERROR]", error);
    return staticEntries;
  }

  const [players, matches, highlights, images, events, tournaments] = dynamicEntries;

  return [
    ...staticEntries,
    ...players.map((player) => ({
      url: `${baseUrl}/players/${player.id}`,
      lastModified: player.createdAt,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...matches.map((match) => ({
      url: `${baseUrl}/matches/${match.id}`,
      lastModified: match.createdAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...highlights.map((highlight) => ({
      url: `${baseUrl}/highlights/${highlight.id}`,
      lastModified: highlight.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...images.map((image) => ({
      url: `${baseUrl}/images/${image.id}`,
      lastModified: image.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...events.map((event) => ({
      url: `${baseUrl}/progress/event/${event.id}`,
      lastModified: event.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...tournaments.map((tournament) => ({
      url: `${baseUrl}/progress/destruction/${tournament.id}`,
      lastModified: tournament.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}

function loadDynamicEntries() {
  return Promise.all([
    prisma.player.findMany({
      where: { isActive: true },
      select: { id: true, createdAt: true },
      orderBy: { id: "asc" },
      take: MAX_DYNAMIC_ENTRIES_PER_TYPE,
    }),
    prisma.matchSeries.findMany({
      select: { id: true, createdAt: true },
      orderBy: { id: "desc" },
      take: MAX_DYNAMIC_ENTRIES_PER_TYPE,
    }),
    prisma.highlight.findMany({
      where: { isPublished: true },
      select: { id: true, updatedAt: true },
      orderBy: { id: "desc" },
      take: MAX_DYNAMIC_ENTRIES_PER_TYPE,
    }),
    prisma.galleryImage.findMany({
      select: { id: true, updatedAt: true },
      orderBy: { id: "desc" },
      take: MAX_DYNAMIC_ENTRIES_PER_TYPE,
    }),
    prisma.eventMatch.findMany({
      select: { id: true, updatedAt: true },
      orderBy: { id: "desc" },
      take: MAX_DYNAMIC_ENTRIES_PER_TYPE,
    }),
    prisma.destructionTournament.findMany({
      select: { id: true, updatedAt: true },
      orderBy: { id: "desc" },
      take: MAX_DYNAMIC_ENTRIES_PER_TYPE,
    }),
  ]);
}
