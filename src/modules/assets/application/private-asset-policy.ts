import type {
  PrivateAssetBinding,
  PrivateAssetPurpose,
  PrivateAssetResourceType,
} from "../domain/private-asset";

export type PrivateAssetAccountActor = Readonly<{
  userAccountId: string;
  sessionId: string;
  purpose: "ACCOUNT";
  role: "USER";
  approvalStatus: "APPROVED" | "RESTRICTED";
}>;

export type PrivateAssetAdminActor = Readonly<{
  userAccountId: string;
  sessionId: string;
  purpose: "ADMIN";
  role: "ADMIN" | "SUPER_ADMIN";
  approvalStatus: "APPROVED";
}>;

export type PrivateAssetJobActor = Readonly<{
  purpose: "JOB";
  principalId: string;
  role: "SYSTEM";
}>;

export type PrivateAssetActor = PrivateAssetAccountActor | PrivateAssetAdminActor | PrivateAssetJobActor;
export type PrivateAssetHumanActor = PrivateAssetAccountActor | PrivateAssetAdminActor;
export type PrivateAssetAction = "CREATE" | "READ" | "DELETE" | "LIST" | "CLEANUP";

export type PrivateAssetResourceBinding = Readonly<{
  resourceType: PrivateAssetResourceType;
  resourceId: string;
  ownerUserAccountId: string | null;
  public: boolean;
}>;

export const OPERATIONAL_PRIVATE_ASSET_PURPOSES = [
  "MATCH_SCOREBOARD",
  "INHOUSE_RESULT",
  "DISCIPLINE_ISSUE",
  "DISCIPLINE_RESOLUTION",
  "GALLERY",
  "HIGHLIGHT_THUMBNAIL",
] as const satisfies readonly PrivateAssetPurpose[];

const PURPOSE_RESOURCES = Object.freeze({
  MATCH_SCOREBOARD: "MATCH_SUBMISSION",
  INHOUSE_RESULT: "INHOUSE_RESULT",
  DISCIPLINE_ISSUE: "DISCIPLINE_TASK",
  DISCIPLINE_RESOLUTION: "DISCIPLINE_TASK",
  GALLERY: "GALLERY_ENTRY",
  HIGHLIGHT_THUMBNAIL: "HIGHLIGHT",
  SECURITY_INCIDENT_EVIDENCE: "SECURITY_INCIDENT",
} satisfies Readonly<Record<PrivateAssetPurpose, PrivateAssetResourceType>>);

const OWNER_PURPOSES = new Set<PrivateAssetPurpose>([
  "MATCH_SCOREBOARD",
  "DISCIPLINE_ISSUE",
  "DISCIPLINE_RESOLUTION",
]);

export function isPurposeCompatibleWithResource(
  purpose: PrivateAssetPurpose,
  resourceType: PrivateAssetResourceType,
) {
  return PURPOSE_RESOURCES[purpose] === resourceType;
}

export function isOperationalPrivateAssetPurpose(purpose: PrivateAssetPurpose) {
  return (OPERATIONAL_PRIVATE_ASSET_PURPOSES as readonly PrivateAssetPurpose[]).includes(purpose);
}

export function mayAccessPrivateAsset(
  actor: PrivateAssetActor,
  action: PrivateAssetAction,
  resource: PrivateAssetResourceBinding,
  purpose: PrivateAssetPurpose,
) {
  if (!isPurposeCompatibleWithResource(purpose, resource.resourceType)) return false;
  if (actor.purpose === "JOB") return action === "CLEANUP";
  if (actor.purpose === "ADMIN") {
    return actor.role === "SUPER_ADMIN" || isOperationalPrivateAssetPurpose(purpose);
  }
  if (
    actor.approvalStatus !== "APPROVED" ||
    (action !== "CREATE" && action !== "READ" && action !== "DELETE") ||
    resource.ownerUserAccountId !== actor.userAccountId ||
    !OWNER_PURPOSES.has(purpose)
  ) {
    return false;
  }
  return resource.resourceType === "MATCH_SUBMISSION" || resource.resourceType === "DISCIPLINE_TASK";
}

export function mayAccessPrivateAssetBinding(
  actor: PrivateAssetActor,
  action: PrivateAssetAction,
  binding: PrivateAssetBinding,
) {
  return mayAccessPrivateAsset(actor, action, binding, binding.asset.purpose);
}

export const CONCEALED_PRIVATE_ASSET_PROBLEM = Object.freeze({
  status: 404 as const,
  body: Object.freeze({
    code: "ASSET_NOT_AVAILABLE" as const,
    title: "자산을 찾을 수 없습니다.",
    detail: "요청한 자산을 사용할 수 없습니다.",
  }),
});

/** Deliberately ignores whether the internal cause was forbidden or absent. */
export function concealPrivateAssetAccess(internalStatus: 403 | 404) {
  void internalStatus;
  return CONCEALED_PRIVATE_ASSET_PROBLEM;
}
