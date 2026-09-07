import { requireCompetition } from "./error";

export type EventStatus =
  | "PLANNED"
  | "RECRUITING"
  | "TEAM_BUILDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type DestructionStatus =
  | "PLANNED"
  | "RECRUITING"
  | "TEAM_BUILDING"
  | "AUCTION"
  | "PRELIMINARY"
  | "TOURNAMENT"
  | "COMPLETED"
  | "CANCELLED";

type NonTerminalEventStatus = Exclude<EventStatus, "COMPLETED" | "CANCELLED">;
type NonTerminalDestructionStatus = Exclude<DestructionStatus, "COMPLETED" | "CANCELLED">;

export type CompetitionLifecycle<S extends string, C extends string> = Readonly<{
  status: S;
  cancelledFrom: C | null;
  cancellationReason: string | null;
}>;

export type EventLifecycle = CompetitionLifecycle<EventStatus, NonTerminalEventStatus>;
export type DestructionLifecycle = CompetitionLifecycle<DestructionStatus, NonTerminalDestructionStatus>;

export const INITIAL_EVENT_LIFECYCLE: EventLifecycle = Object.freeze({
  status: "PLANNED",
  cancelledFrom: null,
  cancellationReason: null,
});

export const INITIAL_DESTRUCTION_LIFECYCLE: DestructionLifecycle = Object.freeze({
  status: "PLANNED",
  cancelledFrom: null,
  cancellationReason: null,
});

export type EventLifecycleCommand =
  | Readonly<{ type: "START_RECRUITMENT" }>
  | Readonly<{ type: "CLOSE_RECRUITMENT"; participantsReady: boolean }>
  | Readonly<{ type: "PUBLISH_BRACKET"; rostersValid: boolean; bracketReady: boolean }>
  | Readonly<{ type: "COMPLETE"; finalResultConfirmed: boolean }>
  | Readonly<{ type: "CANCEL"; reason: string }>
  | Readonly<{ type: "RESTORE_CANCELLED" }>;

export type DestructionLifecycleCommand =
  | Readonly<{ type: "START_RECRUITMENT" }>
  | Readonly<{ type: "CLOSE_RECRUITMENT"; participantsReady: boolean }>
  | Readonly<{ type: "START_AUCTION"; rostersValid: boolean }>
  | Readonly<{ type: "PUBLISH_PRELIMINARY"; auctionComplete: boolean; fixturesReady: boolean }>
  | Readonly<{ type: "PUBLISH_TOURNAMENT"; preliminaryComplete: boolean; finalistCount: number }>
  | Readonly<{ type: "COMPLETE"; finalResultConfirmed: boolean }>
  | Readonly<{ type: "CANCEL"; reason: string }>
  | Readonly<{ type: "RESTORE_CANCELLED" }>;

function normalizedCancellationReason(reason: string) {
  const normalizedInput = reason.normalize("NFKC").trim();
  requireCompetition(
    normalizedInput.length >= 2 &&
      normalizedInput.length <= 300 &&
      !/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(normalizedInput),
    "PRECONDITION_FAILED",
    "A safe cancellation reason between 2 and 300 characters is required.",
  );
  return normalizedInput.replace(/\s+/gu, " ");
}

function eventState(status: EventStatus): EventLifecycle {
  return { status, cancelledFrom: null, cancellationReason: null };
}

function destructionState(status: DestructionStatus): DestructionLifecycle {
  return { status, cancelledFrom: null, cancellationReason: null };
}

function validateLifecycleState(
  lifecycle: CompetitionLifecycle<string, string>,
  terminalStatus: string,
) {
  if (lifecycle.status === "CANCELLED") {
    requireCompetition(
      lifecycle.cancelledFrom !== null &&
        lifecycle.cancelledFrom !== "CANCELLED" &&
        lifecycle.cancelledFrom !== terminalStatus &&
        lifecycle.cancellationReason !== null &&
        normalizedCancellationReason(lifecycle.cancellationReason) === lifecycle.cancellationReason,
      "INVALID_TRANSITION",
      "A cancelled lifecycle must retain its canonical reason and non-terminal prior state.",
    );
  } else {
    requireCompetition(
      lifecycle.cancelledFrom === null && lifecycle.cancellationReason === null,
      "INVALID_TRANSITION",
      "Only a cancelled lifecycle may retain cancellation recovery data.",
    );
  }
}

export function transitionEventLifecycle(
  lifecycle: EventLifecycle,
  command: EventLifecycleCommand,
): EventLifecycle {
  validateLifecycleState(lifecycle, "COMPLETED");
  if (command.type === "CANCEL") {
    requireCompetition(
      lifecycle.status !== "COMPLETED" && lifecycle.status !== "CANCELLED",
      "INVALID_TRANSITION",
      `An event in ${lifecycle.status} cannot be cancelled.`,
    );
    return {
      status: "CANCELLED",
      cancelledFrom: lifecycle.status,
      cancellationReason: normalizedCancellationReason(command.reason),
    };
  }

  if (command.type === "RESTORE_CANCELLED") {
    requireCompetition(
      lifecycle.status === "CANCELLED" && lifecycle.cancelledFrom !== null,
      "INVALID_TRANSITION",
      "Only a cancelled event with its recorded prior state can be restored.",
    );
    return eventState(lifecycle.cancelledFrom);
  }

  switch (command.type) {
    case "START_RECRUITMENT":
      requireCompetition(lifecycle.status === "PLANNED", "INVALID_TRANSITION", "Recruitment starts from PLANNED.");
      return eventState("RECRUITING");
    case "CLOSE_RECRUITMENT":
      requireCompetition(lifecycle.status === "RECRUITING", "INVALID_TRANSITION", "Recruitment closes from RECRUITING.");
      requireCompetition(command.participantsReady, "PRECONDITION_FAILED", "Accepted participants are not ready.");
      return eventState("TEAM_BUILDING");
    case "PUBLISH_BRACKET":
      requireCompetition(lifecycle.status === "TEAM_BUILDING", "INVALID_TRANSITION", "A bracket publishes from TEAM_BUILDING.");
      requireCompetition(command.rostersValid && command.bracketReady, "PRECONDITION_FAILED", "Valid rosters and a complete bracket are required.");
      return eventState("IN_PROGRESS");
    case "COMPLETE":
      requireCompetition(lifecycle.status === "IN_PROGRESS", "INVALID_TRANSITION", "An event completes from IN_PROGRESS.");
      requireCompetition(command.finalResultConfirmed, "PRECONDITION_FAILED", "A confirmed final result is required.");
      return eventState("COMPLETED");
  }
}

export function transitionDestructionLifecycle(
  lifecycle: DestructionLifecycle,
  command: DestructionLifecycleCommand,
): DestructionLifecycle {
  validateLifecycleState(lifecycle, "COMPLETED");
  if (command.type === "CANCEL") {
    requireCompetition(
      lifecycle.status !== "COMPLETED" && lifecycle.status !== "CANCELLED",
      "INVALID_TRANSITION",
      `A destruction competition in ${lifecycle.status} cannot be cancelled.`,
    );
    return {
      status: "CANCELLED",
      cancelledFrom: lifecycle.status,
      cancellationReason: normalizedCancellationReason(command.reason),
    };
  }

  if (command.type === "RESTORE_CANCELLED") {
    requireCompetition(
      lifecycle.status === "CANCELLED" && lifecycle.cancelledFrom !== null,
      "INVALID_TRANSITION",
      "Only a cancelled competition with its recorded prior state can be restored.",
    );
    return destructionState(lifecycle.cancelledFrom);
  }

  switch (command.type) {
    case "START_RECRUITMENT":
      requireCompetition(lifecycle.status === "PLANNED", "INVALID_TRANSITION", "Recruitment starts from PLANNED.");
      return destructionState("RECRUITING");
    case "CLOSE_RECRUITMENT":
      requireCompetition(lifecycle.status === "RECRUITING", "INVALID_TRANSITION", "Recruitment closes from RECRUITING.");
      requireCompetition(command.participantsReady, "PRECONDITION_FAILED", "Accepted participants are not ready.");
      return destructionState("TEAM_BUILDING");
    case "START_AUCTION":
      requireCompetition(lifecycle.status === "TEAM_BUILDING", "INVALID_TRANSITION", "An auction starts from TEAM_BUILDING.");
      requireCompetition(command.rostersValid, "PRECONDITION_FAILED", "Every team needs a valid roster before auction.");
      return destructionState("AUCTION");
    case "PUBLISH_PRELIMINARY":
      requireCompetition(lifecycle.status === "AUCTION", "INVALID_TRANSITION", "Preliminaries publish from AUCTION.");
      requireCompetition(command.auctionComplete && command.fixturesReady, "PRECONDITION_FAILED", "A completed auction and complete preliminary fixtures are required.");
      return destructionState("PRELIMINARY");
    case "PUBLISH_TOURNAMENT":
      requireCompetition(lifecycle.status === "PRELIMINARY", "INVALID_TRANSITION", "The tournament publishes from PRELIMINARY.");
      requireCompetition(command.preliminaryComplete && command.finalistCount === 4, "PRECONDITION_FAILED", "Exactly four finalists from completed preliminaries are required.");
      return destructionState("TOURNAMENT");
    case "COMPLETE":
      requireCompetition(lifecycle.status === "TOURNAMENT", "INVALID_TRANSITION", "A destruction competition completes from TOURNAMENT.");
      requireCompetition(command.finalResultConfirmed, "PRECONDITION_FAILED", "A confirmed final result is required.");
      return destructionState("COMPLETED");
  }
}
