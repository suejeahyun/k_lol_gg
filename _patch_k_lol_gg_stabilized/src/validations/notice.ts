import { NoticeInput } from "@/types/notice";

type NoticeValidationResult =
  | {
      success: true;
      data: Required<Pick<NoticeInput, "title" | "content">> &
        Pick<NoticeInput, "isPinned">;
    }
  | {
      success: false;
      message: string;
    };

export function validateNoticeInput(input: unknown): NoticeValidationResult {
  if (!input || typeof input !== "object") {
    return {
      success: false,
      message: "잘못된 요청입니다.",
    };
  }

  const raw = input as Record<string, unknown>;

  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const content = typeof raw.content === "string" ? raw.content.trim() : "";
  const isPinned = typeof raw.isPinned === "boolean" ? raw.isPinned : false;

  if (!title) {
    return {
      success: false,
      message: "제목을 입력해주세요.",
    };
  }

  if (title.length > 100) {
    return {
      success: false,
      message: "제목은 100자 이하로 입력해주세요.",
    };
  }

  if (!content) {
    return {
      success: false,
      message: "내용을 입력해주세요.",
    };
  }

  return {
    success: true,
    data: {
      title,
      content,
      isPinned,
    },
  };
}