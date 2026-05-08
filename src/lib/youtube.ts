export function extractYoutubeId(input: string): string | null {
  const raw = input.trim();

  if (!raw) return null;

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return normalizeYoutubeId(id);
    }

    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (url.pathname === "/watch") {
        return normalizeYoutubeId(url.searchParams.get("v"));
      }

      const parts = url.pathname.split("/").filter(Boolean);
      const supportedPrefixes = ["embed", "shorts", "live"];

      if (parts.length >= 2 && supportedPrefixes.includes(parts[0])) {
        return normalizeYoutubeId(parts[1]);
      }
    }
  } catch {
    return normalizeYoutubeId(raw);
  }

  return null;
}

function normalizeYoutubeId(value: string | null | undefined): string | null {
  if (!value) return null;

  const id = value.trim();

  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return null;
  }

  return id;
}

export function getYoutubeEmbedUrl(youtubeId: string) {
  return `https://www.youtube.com/embed/${youtubeId}`;
}

export function getYoutubeWatchUrl(youtubeId: string) {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}

export function getYoutubeThumbnailUrl(youtubeId: string) {
  return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
}
