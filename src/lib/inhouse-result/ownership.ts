type OwnedInhouseSubmission = {
  submittedByUserAccountId: number | null;
  parsedData: unknown;
};

export function legacyInhouseSubmissionOwnerId(parsedData: unknown) {
  if (!parsedData || typeof parsedData !== "object" || Array.isArray(parsedData)) return null;
  const rawOwnerId = (parsedData as Record<string, unknown>).submittedByUserAccountId;
  if (typeof rawOwnerId !== "number" && typeof rawOwnerId !== "string") return null;
  const ownerId = Number(rawOwnerId);
  return Number.isSafeInteger(ownerId) && ownerId > 0 ? ownerId : null;
}

export function isInhouseSubmissionOwner(
  submission: OwnedInhouseSubmission,
  userAccountId: number,
) {
  // Once the relational owner is present it is authoritative. Falling back on
  // conflicting legacy JSON would allow stale data to bypass ownership checks.
  if (submission.submittedByUserAccountId !== null) {
    return submission.submittedByUserAccountId === userAccountId;
  }
  return legacyInhouseSubmissionOwnerId(submission.parsedData) === userAccountId;
}
