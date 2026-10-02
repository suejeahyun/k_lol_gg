import { OperationFormError, parseOperationFormPayload } from "./domain";

export const SITE_SUPPORT_SOURCE = "site-support-v1";
export const SITE_SUPPORT_RETENTION_DAYS = 180;
export const SUPPORT_CATEGORIES = ["이용 문의", "오류 신고", "계정·승인", "개인정보 열람·정정·삭제", "개선 제안"] as const;

export function parseSiteSupportInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new OperationFormError("INVALID_FORM_PAYLOAD");
  const input = value as Record<string, unknown>;
  const keys = ["nickname", "replyTo", "category", "content", "consent"].sort();
  const actual = Object.keys(input).sort();
  if (keys.length !== actual.length || keys.some((key, index) => key !== actual[index]) || input.consent !== true || !(SUPPORT_CATEGORIES as readonly unknown[]).includes(input.category)) throw new OperationFormError("INVALID_FORM_PAYLOAD");
  return parseOperationFormPayload("suggestions", {
    applicantName: input.nickname,
    applicantNickname: input.replyTo,
    reason: `[사이트 문의] ${input.category}`,
    content: input.content,
  });
}

export function supportAuditSummary(form: { id: string; revision: number; status: string }) {
  return { id: form.id, revision: form.revision, status: form.status, source: SITE_SUPPORT_SOURCE };
}
