const SUBMISSION_STATUSES = new Set([
  "AWAITING_UPLOAD",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);

export type AdminImportLatestProjection = Readonly<{
  revision: number;
  status: string;
}>;

export type AdminImportUploadFailurePlan =
  | Readonly<{ kind: "REPLAY_SAME_KEY" }>
  | Readonly<{ kind: "RETRY_OR_RESELECT" }>
  | Readonly<{ kind: "RETRY_NEW_KEY"; revision: number }>
  | Readonly<{ kind: "OPEN_REVIEW"; revision: number }>;

export function parseAdminImportLatestProjection(value: unknown): AdminImportLatestProjection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const submission = (value as { submission?: unknown }).submission;
  if (!submission || typeof submission !== "object" || Array.isArray(submission)) return null;
  const { revision, status } = submission as { revision?: unknown; status?: unknown };
  if (
    !Number.isSafeInteger(revision) ||
    Number(revision) < 0 ||
    typeof status !== "string" ||
    !SUBMISSION_STATUSES.has(status)
  ) return null;
  return { revision: Number(revision), status };
}

export function planAdminImportUploadFailure({
  uploadStatus,
  currentRevision,
  latest,
}: {
  uploadStatus: number | null;
  currentRevision: number;
  latest?: AdminImportLatestProjection | null;
}): AdminImportUploadFailurePlan {
  if (uploadStatus === null || uploadStatus >= 500 || uploadStatus === 408 || uploadStatus === 425 || uploadStatus === 429) {
    return { kind: "REPLAY_SAME_KEY" };
  }
  if (uploadStatus !== 409 && uploadStatus !== 412) {
    return { kind: "RETRY_OR_RESELECT" };
  }
  if (!latest) return { kind: "REPLAY_SAME_KEY" };
  if (latest.status !== "AWAITING_UPLOAD") {
    return { kind: "OPEN_REVIEW", revision: latest.revision };
  }
  if (latest.revision !== currentRevision) {
    return { kind: "RETRY_NEW_KEY", revision: latest.revision };
  }
  return { kind: "REPLAY_SAME_KEY" };
}
