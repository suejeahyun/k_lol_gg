import { canonicalIdentifier, requireCompetition } from "../core/error";
import type { CompetitionPosition } from "../core";

export type DestructionApplicationStatus = "APPLIED" | "CONFIRMED" | "RESERVE" | "REJECTED" | "CANCELLED";
export type DestructionApplication = Readonly<{
  id: string;
  userAccountId: string;
  playerId: string;
  position: CompetitionPosition;
  status: DestructionApplicationStatus;
}>;

export type DestructionApplicationIntent =
  | Readonly<{ type: "APPLY"; actorUserAccountId: string; playerId: string }>
  | Readonly<{ type: "CANCEL_APPLICATION"; actorUserAccountId: string; applicationId: string; authorization: "OWNER" | "ADMIN" }>;

export function authorizeDestructionApplicationIntent(
  intent: DestructionApplicationIntent,
  application?: DestructionApplication,
) {
  canonicalIdentifier(intent.actorUserAccountId, "actorUserAccountId");
  if (intent.type === "APPLY") {
    canonicalIdentifier(intent.playerId, "playerId");
    return Object.freeze({ requiredPurpose: "ACCOUNT", requiredRole: "USER", authorization: "APPROVED_ACCOUNT_MUTATION" } as const);
  }
  canonicalIdentifier(intent.applicationId, "applicationId");
  requireCompetition(application?.id === intent.applicationId, "PRECONDITION_FAILED", "The application does not exist.");
  const isOwner = application.userAccountId === intent.actorUserAccountId;
  requireCompetition(intent.authorization === "ADMIN" || isOwner, "PRECONDITION_FAILED", "Only the application owner or an administrator may cancel it.");
  requireCompetition(application.status === "APPLIED" || application.status === "RESERVE", "INVALID_TRANSITION", "Only an applied or reserve application may be cancelled.");
  return intent.authorization === "ADMIN"
    ? Object.freeze({ requiredPurpose: "ADMIN", requiredRole: "ADMIN", authorization: "ADMIN_MUTATION" } as const)
    : Object.freeze({ requiredPurpose: "ACCOUNT", requiredRole: "USER", authorization: "APPROVED_ACCOUNT_MUTATION" } as const);
}
export function cancelDestructionApplication(
  application: DestructionApplication,
  intent: Extract<DestructionApplicationIntent, { type: "CANCEL_APPLICATION" }>,
) {
  authorizeDestructionApplicationIntent(intent, application);
  return Object.freeze({ ...application, status: "CANCELLED" as const });
}
