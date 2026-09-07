export type DisciplineTaskStatus =
  | "REQUIRED"
  | "AWAITING_UPLOAD"
  | "PENDING_REVIEW"
  | "REJECTED"
  | "APPROVED"
  | "CANCELLED";

export type DisciplineEvidence = Readonly<{
  id: string;
  sha256Hex: string;
  submittedAt: Date;
  supersededAt: Date | null;
}>;

export type DisciplineTask = Readonly<{
  id: string;
  revision: number;
  ownerAccountId: string | null;
  ownerPlayerId: string | null;
  requiredGameCount: number;
  dueAt: Date;
  status: DisciplineTaskStatus;
  reviewBoundaryAt: Date | null;
  evidence: readonly DisciplineEvidence[];
}>;

function requireRevision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("INVALID_TASK_REVISION");
}

function assertExpectedRevision(task: DisciplineTask, expectedRevision: number): void {
  requireRevision(expectedRevision);
  if (task.revision !== expectedRevision) throw new Error("STALE_TASK_REVISION");
}

function isOwner(task: DisciplineTask, accountId: string, playerId: string | null): boolean {
  return task.ownerAccountId === accountId ||
    (task.ownerAccountId === null && playerId !== null && task.ownerPlayerId === playerId);
}

export function currentEvidence(task: DisciplineTask): readonly DisciplineEvidence[] {
  return task.evidence.filter((evidence) =>
    evidence.supersededAt === null &&
    (task.reviewBoundaryAt === null || evidence.submittedAt.getTime() > task.reviewBoundaryAt.getTime()),
  );
}

export function submitDisciplineEvidence(input: Readonly<{
  task: DisciplineTask;
  expectedRevision: number;
  accountId: string;
  playerId: string | null;
  evidence: DisciplineEvidence;
  now: Date;
}>): DisciplineTask {
  assertExpectedRevision(input.task, input.expectedRevision);
  if (!Number.isSafeInteger(input.task.requiredGameCount) || input.task.requiredGameCount <= 0 || input.task.requiredGameCount > 100) {
    throw new Error("INVALID_DISCIPLINE_REQUIRED_COUNT");
  }
  if (!isOwner(input.task, input.accountId, input.playerId)) throw new Error("DISCIPLINE_TASK_NOT_FOUND");
  if (!Number.isFinite(input.now.getTime()) || input.task.dueAt.getTime() <= input.now.getTime()) {
    throw new Error("DISCIPLINE_TASK_EXPIRED");
  }
  if (!["REQUIRED", "AWAITING_UPLOAD", "REJECTED"].includes(input.task.status)) {
    throw new Error("DISCIPLINE_TASK_NOT_UPLOADABLE");
  }
  if (
    !input.evidence.id ||
    !/^[a-f0-9]{64}$/.test(input.evidence.sha256Hex) ||
    !Number.isFinite(input.evidence.submittedAt.getTime()) ||
    input.evidence.submittedAt.getTime() > input.now.getTime()
  ) {
    throw new Error("INVALID_DISCIPLINE_EVIDENCE");
  }
  if (input.task.evidence.some((evidence) => evidence.sha256Hex === input.evidence.sha256Hex)) {
    throw new Error("DUPLICATE_DISCIPLINE_EVIDENCE");
  }
  const activeCount = currentEvidence(input.task).length;
  if (activeCount >= input.task.requiredGameCount) throw new Error("DISCIPLINE_TASK_ALREADY_COMPLETE");
  const nextCount = activeCount + 1;
  return {
    ...input.task,
    revision: input.task.revision + 1,
    status: nextCount === input.task.requiredGameCount ? "PENDING_REVIEW" : "AWAITING_UPLOAD",
    evidence: [...input.task.evidence, input.evidence],
  };
}

export function reviewDisciplineEvidence(input: Readonly<{
  task: DisciplineTask;
  expectedRevision: number;
  decision: "APPROVE" | "REJECT" | "CANCEL";
  reviewNote: string;
  now: Date;
}>): DisciplineTask {
  assertExpectedRevision(input.task, input.expectedRevision);
  if (input.task.status !== "PENDING_REVIEW") throw new Error("DISCIPLINE_TASK_NOT_REVIEWABLE");
  const note = input.reviewNote.normalize("NFKC").trim();
  if ((input.decision === "REJECT" || input.decision === "CANCEL") && !note) {
    throw new Error("DISCIPLINE_REVIEW_NOTE_REQUIRED");
  }
  if (!Number.isFinite(input.now.getTime())) throw new Error("INVALID_REVIEW_TIME");
  if (input.decision === "APPROVE" && currentEvidence(input.task).length !== input.task.requiredGameCount) {
    throw new Error("DISCIPLINE_EVIDENCE_COUNT_MISMATCH");
  }
  return {
    ...input.task,
    revision: input.task.revision + 1,
    status: input.decision === "APPROVE"
      ? "APPROVED"
      : input.decision === "REJECT"
        ? "REJECTED"
        : "CANCELLED",
    reviewBoundaryAt: input.decision === "REJECT" ? input.now : input.task.reviewBoundaryAt,
  };
}
