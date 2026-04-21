import { KakaoPlayerSearchInput } from "@/types/kakao";

function normalizeTag(tag: string) {
  return tag.trim().toUpperCase();
}

function normalizeNickname(nickname: string) {
  return nickname.trim();
}

export function parseNicknameTag(input: string): KakaoPlayerSearchInput {
  const rawText = String(input ?? "").trim();

  if (!rawText) {
    throw new Error("검색어가 비어 있습니다. 닉네임#태그 형식으로 입력해 주세요.");
  }

  const hashIndex = rawText.lastIndexOf("#");

  if (hashIndex === -1) {
    throw new Error("닉네임#태그 형식으로 입력해 주세요. 예: 마도사#KR11");
  }

  const nickname = normalizeNickname(rawText.slice(0, hashIndex));
  const tag = normalizeTag(rawText.slice(hashIndex + 1));

  if (!nickname || !tag) {
    throw new Error("닉네임 또는 태그가 비어 있습니다. 예: 마도사#KR11");
  }

  return {
    rawText,
    nickname,
    tag,
  };
}

type KakaoRequestBody = {
  userRequest?: {
    utterance?: string;
  };
  action?: {
    params?: {
      query?: string;
    };
  };
  query?: string;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function extractKakaoUtterance(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "";
  }

  const safeBody = body as KakaoRequestBody;

  const query = cleanText(safeBody.action?.params?.query);
  if (query) {
    return query;
  }

  const utterance = cleanText(safeBody.userRequest?.utterance);
  if (utterance) {
    return utterance;
  }

  const directQuery = cleanText(safeBody.query);
  if (directQuery) {
    return directQuery;
  }

  return "";
}