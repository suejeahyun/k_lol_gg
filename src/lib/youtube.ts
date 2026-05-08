const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export function getYoutubeVideoId(url: string) {
  const value = url.trim();

  if (!value) return null;

  try {
    const parsedUrl = new URL(value);
    const host = parsedUrl.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsedUrl.pathname === "/watch") {
        const videoId = parsedUrl.searchParams.get("v");
        return videoId && YOUTUBE_ID_PATTERN.test(videoId) ? videoId : null;
      }

      const pathParts = parsedUrl.pathname.split("/").filter(Boolean);

      if (["embed", "shorts", "live"].includes(pathParts[0] ?? "")) {
        const videoId = pathParts[1];
        return videoId && YOUTUBE_ID_PATTERN.test(videoId) ? videoId : null;
      }
    }

    if (host === "youtu.be") {
      const videoId = parsedUrl.pathname.split("/").filter(Boolean)[0];
      return videoId && YOUTUBE_ID_PATTERN.test(videoId) ? videoId : null;
    }

    return null;
  } catch {
    return null;
  }
}

export function getYoutubeEmbedUrl(url: string) {
  const videoId = getYoutubeVideoId(url);
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}

export function normalizeYoutubeUrls(urls: unknown) {
  if (!Array.isArray(urls)) return [];

  const normalizedUrls = urls
    .map((url) => (typeof url === "string" ? url.trim() : ""))
    .filter(Boolean);

  return Array.from(new Set(normalizedUrls));
}

export function hasOnlyValidYoutubeUrls(urls: string[]) {
  return urls.every((url) => Boolean(getYoutubeVideoId(url)));
}
