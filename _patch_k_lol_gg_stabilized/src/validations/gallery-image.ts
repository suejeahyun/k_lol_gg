import { GalleryImageInput } from "@/types/gallery-image";

type GalleryImageValidationResult =
  | {
      success: true;
      data: Required<Pick<GalleryImageInput, "title" | "description" | "imageUrl">>;
    }
  | {
      success: false;
      message: string;
    };

export function validateGalleryImageInput(
  input: unknown
): GalleryImageValidationResult {
  if (!input || typeof input !== "object") {
    return {
      success: false,
      message: "잘못된 요청입니다.",
    };
  }

  const raw = input as Record<string, unknown>;

  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const description =
    typeof raw.description === "string" ? raw.description.trim() : "";
  const imageUrl = typeof raw.imageUrl === "string" ? raw.imageUrl.trim() : "";

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

  if (!description) {
    return {
      success: false,
      message: "설명을 입력해주세요.",
    };
  }

  if (!imageUrl) {
    return {
      success: false,
      message: "이미지 URL을 입력해주세요.",
    };
  }

  if (!isValidUrl(imageUrl)) {
    return {
      success: false,
      message: "이미지 URL 형식이 올바르지 않습니다.",
    };
  }

  return {
    success: true,
    data: {
      title,
      description,
      imageUrl,
    },
  };
}

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}