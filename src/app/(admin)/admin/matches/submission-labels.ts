export const SUBMISSION_STATUS_LABEL = {
  AWAITING_UPLOAD: "이미지 등록 중",
  PENDING_REVIEW: "검토 대기",
  APPROVED: "승인",
  REJECTED: "거절",
  CANCELLED: "사용자 취소",
} as const;

export const SUBMISSION_OCR_STATUS_LABEL = {
  NOT_REQUESTED: "분석 전",
  PENDING: "분석 중",
  SUCCEEDED: "분석 완료",
  FAILED: "분석 실패",
} as const;
