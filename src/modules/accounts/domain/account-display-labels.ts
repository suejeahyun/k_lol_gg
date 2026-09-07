export type AccountRoleCode = "USER" | "ADMIN" | "SUPER_ADMIN";
export type PlayerStatusCode = "ACTIVE" | "INACTIVE";

const roleLabels = {
  USER: "일반 사용자 (USER)",
  ADMIN: "관리자 (ADMIN)",
  SUPER_ADMIN: "최고 관리자 (SUPER_ADMIN)",
} satisfies Record<AccountRoleCode, string>;

const playerStatusLabels = {
  ACTIVE: "활성",
  INACTIVE: "비활성",
} satisfies Record<PlayerStatusCode, string>;

export function accountRoleLabel(role: AccountRoleCode) {
  return roleLabels[role];
}

export function playerStatusLabel(status: PlayerStatusCode) {
  return playerStatusLabels[status];
}
