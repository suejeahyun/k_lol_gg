import { CommunityPostType, CommunitySuggestionStatus } from "@prisma/client";

export const communityTypeLabels: Record<CommunityPostType, string> = {
  HIGHLIGHT: "하이라이트",
  SUGGESTION: "건의사항",
  MATCH_REVIEW: "매치 리뷰",
  FREE: "자유게시판",
  NOTICE_COMMENT: "공지 댓글",
};

export const communityTypePaths: Record<CommunityPostType, string> = {
  HIGHLIGHT: "/community/highlights",
  SUGGESTION: "/community/suggestions",
  MATCH_REVIEW: "/community/match-reviews",
  FREE: "/community/free",
  NOTICE_COMMENT: "/community/notice-comments",
};

export const suggestionStatusLabels: Record<CommunitySuggestionStatus, string> = {
  RECEIVED: "접수",
  REVIEWING: "검토중",
  PLANNED: "적용예정",
  COMPLETED: "완료",
  HOLD: "보류",
};

export function getCommunityTypeFromSlug(slug: string): CommunityPostType | null {
  const map: Record<string, CommunityPostType> = {
    highlights: "HIGHLIGHT",
    suggestions: "SUGGESTION",
    "match-reviews": "MATCH_REVIEW",
    free: "FREE",
  };
  return map[slug] ?? null;
}

export function getCommunitySlugFromType(type: CommunityPostType) {
  const path = communityTypePaths[type];
  return path.split("/").filter(Boolean).at(-1) ?? "free";
}

export function getYoutubeVideoId(url: string) {
  const value = url.trim();
  if (!value) return null;
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/watch\?[^\s]*v=([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function getAutoThumbnail(videoUrl?: string | null) {
  if (!videoUrl) return null;
  const youtubeId = getYoutubeVideoId(videoUrl);
  if (youtubeId) return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
  return null;
}

export function isValidExternalVideoUrl(url: string) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function formatCommunityDate(date: Date) {
  return new Date(date).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
