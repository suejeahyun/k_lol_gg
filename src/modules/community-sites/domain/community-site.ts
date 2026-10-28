import { validateCommunitySiteConfig, type CommunitySiteConfig } from "./site-configuration";

export const COMMUNITY_SITE_STATUSES = ["SUBMITTED", "CHANGES_REQUESTED", "REJECTED", "CANCELLED", "APPROVED", "PROVISIONING", "AWAITING_OWNER", "ACTIVATING", "ACTIVE", "FAILED"] as const;
export type CommunitySiteStatus = typeof COMMUNITY_SITE_STATUSES[number];
export type CommunitySiteJobKind = "PROVISION" | "PUBLISH_CONFIGURATION" | "ACTIVATE_SITE";
export type CommunitySiteJobStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type CommunityPublicSite = Readonly<{ id: string; name: string; description: string; origin: string }>;
export type CommunitySiteJobSummary = Readonly<{
  id: string; kind: CommunitySiteJobKind; status: CommunitySiteJobStatus; checkpoint: string;
  attemptCount: number; errorCode: string | null; createdAt: string; updatedAt: string;
}>;
export type CommunitySite = Readonly<{
  id: string; ownerUserAccountId: string; configuration: CommunitySiteConfig;
  publishedConfiguration: CommunitySiteConfig | null; status: CommunitySiteStatus; revision: number;
  reviewReason: string | null; origin: string | null; createdAt: string; updatedAt: string;
  latestJob: CommunitySiteJobSummary | null;
}>;
export type CreateCommunitySiteCommand = Readonly<{ action: "submit"; configuration: CommunitySiteConfig }>;
export type OwnerCommunitySiteCommand = Readonly<{ action: "update"; configuration: CommunitySiteConfig }>
  | Readonly<{ action: "submit" | "cancel" | "publish" | "activate" }>;
export type ReviewCommunitySiteCommand = Readonly<{ action: "approve" | "request_changes" | "reject"; reason: string }>;

export class CommunitySiteError extends Error {
  constructor(readonly code: string) { super(code); }
}
function invalid(): never { throw new CommunitySiteError("INVALID_COMMUNITY_SITE_INPUT"); }
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key))) return invalid();
  return result;
}
export function parseCommunitySiteId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) return invalid();
  return value.toLowerCase();
}
export function parseCreateCommunitySiteCommand(value: unknown): CreateCommunitySiteCommand {
  const input = record(value, ["action", "configuration"]);
  if (input.action !== "submit") return invalid();
  return { action: "submit", configuration: validateCommunitySiteConfig(input.configuration) };
}
export function parseOwnerCommunitySiteCommand(value: unknown): OwnerCommunitySiteCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const action = (value as Record<string, unknown>).action;
  const input = record(value, action === "update" ? ["action", "configuration"] : ["action"]);
  if (action === "update") return { action, configuration: validateCommunitySiteConfig(input.configuration) };
  if (action === "submit" || action === "cancel" || action === "publish" || action === "activate") return { action };
  return invalid();
}
export function parseReviewCommunitySiteCommand(value: unknown): ReviewCommunitySiteCommand {
  const input = record(value, ["action", "reason"]);
  if (input.action !== "approve" && input.action !== "request_changes" && input.action !== "reject") return invalid();
  if (typeof input.reason !== "string" || input.reason.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(input.reason)) return invalid();
  const reason = input.reason.trim();
  if (input.action !== "approve" && !reason) return invalid();
  return { action: input.action, reason };
}
export function assertCommunitySiteRevision(current: number, expected: number) {
  if (!Number.isSafeInteger(expected) || expected < 0) throw new CommunitySiteError("INVALID_COMMUNITY_SITE_REVISION");
  if (current !== expected) throw new CommunitySiteError("STALE_COMMUNITY_SITE_REVISION");
  if (current >= Number.MAX_SAFE_INTEGER) throw new CommunitySiteError("INVALID_COMMUNITY_SITE_REVISION");
}
export function ownerCommunitySiteTransition(status: CommunitySiteStatus, command: OwnerCommunitySiteCommand): CommunitySiteStatus {
  const editable = ["SUBMITTED", "CHANGES_REQUESTED", "REJECTED", "CANCELLED", "ACTIVE"];
  if (command.action === "update" && editable.includes(status)) return status;
  if (command.action === "submit" && ["CHANGES_REQUESTED", "REJECTED", "CANCELLED"].includes(status)) return "SUBMITTED";
  if (command.action === "cancel" && ["SUBMITTED", "CHANGES_REQUESTED", "REJECTED"].includes(status)) return "CANCELLED";
  if (command.action === "publish" && status === "ACTIVE") return "ACTIVE";
  if (command.action === "activate" && ["AWAITING_OWNER", "ACTIVATING"].includes(status)) return "ACTIVATING";
  throw new CommunitySiteError("COMMUNITY_SITE_STATE_CONFLICT");
}
export function reviewCommunitySiteTransition(status: CommunitySiteStatus, command: ReviewCommunitySiteCommand): CommunitySiteStatus {
  if (status === "FAILED" && command.action === "approve") return "APPROVED";
  if (status !== "SUBMITTED") throw new CommunitySiteError("COMMUNITY_SITE_STATE_CONFLICT");
  return command.action === "approve" ? "APPROVED" : command.action === "reject" ? "REJECTED" : "CHANGES_REQUESTED";
}
