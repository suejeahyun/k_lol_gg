export function advanceOneTimeSecretEpoch(currentEpoch: number) {
  return currentEpoch + 1;
}

export function shouldApplyRevisionProjection({
  latestRevision,
  projectionRevision,
}: {
  latestRevision: number;
  projectionRevision: number;
}) {
  return projectionRevision >= latestRevision;
}

export function advanceLatestRevision(latestRevision: number, candidateRevision: number) {
  return Math.max(latestRevision, candidateRevision);
}

export function isOneTimeSecretRevisionCurrent({
  latestRevision,
  issuedRevision,
}: {
  latestRevision: number;
  issuedRevision: number;
}) {
  return latestRevision <= issuedRevision;
}

export function canPresentOneTimeSecret({
  requestEpoch,
  currentEpoch,
  visibilityState,
}: {
  requestEpoch: number;
  currentEpoch: number;
  visibilityState: DocumentVisibilityState;
}) {
  return requestEpoch === currentEpoch && visibilityState === "visible";
}

export function shouldRestoreOneTimeSecretPage({
  persisted,
  pageHiddenSinceMount,
  cleanupPending,
}: {
  persisted: boolean;
  pageHiddenSinceMount: boolean;
  cleanupPending: boolean;
}) {
  return persisted || pageHiddenSinceMount || cleanupPending;
}
