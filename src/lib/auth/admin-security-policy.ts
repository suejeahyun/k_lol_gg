export type AdminRole = "ADMIN" | "SUPER_ADMIN";

export function isAdminRole(role: string): role is AdminRole {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export function isAdminTwoFactorReady(params: {
  role: string;
  adminTotpEnabled: boolean;
  tokenTotpVerified: boolean;
}) {
  if (!isAdminRole(params.role)) return false;
  return params.adminTotpEnabled && params.tokenTotpVerified;
}

export function canManageAccountApproval(
  actorRole: AdminRole,
  targetRole: string,
) {
  if (!isAdminRole(targetRole)) return true;
  if (targetRole === "SUPER_ADMIN") return false;
  return actorRole === "SUPER_ADMIN";
}

export function canViewPrivateAsset(role: AdminRole, purpose: string) {
  if (role === "SUPER_ADMIN") return true;
  // Current ADMIN duties include both discipline review stages and in-house
  // result review. Unknown/future asset purposes stay SUPER_ADMIN-only until
  // a dedicated permission is introduced.
  return ["INHOUSE_RESULT", "DISCIPLINE_ISSUE", "DISCIPLINE_RESOLUTION"].includes(purpose);
}
