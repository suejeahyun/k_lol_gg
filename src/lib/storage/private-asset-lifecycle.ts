export type PrivateAssetLifecycleState =
  | "PENDING"
  | "ACTIVE"
  | "EXPIRED"
  | "DELETE_PENDING"
  | "DELETED"
  | "ERROR";

export type PrivateAssetLifecycleSource = {
  expiresAt: Date | string | null;
  deletedAt: Date | string | null;
};

export function resolvePrivateAssetLifecycle(
  source: PrivateAssetLifecycleSource,
  now = new Date(),
): PrivateAssetLifecycleState {
  if (source.deletedAt) return "DELETED";
  if (source.expiresAt && new Date(source.expiresAt).getTime() <= now.getTime()) {
    return "EXPIRED";
  }
  return "ACTIVE";
}

export function isPrivateAssetExpired(
  source: Pick<PrivateAssetLifecycleSource, "expiresAt">,
  now = new Date(),
) {
  return Boolean(
    source.expiresAt && new Date(source.expiresAt).getTime() <= now.getTime(),
  );
}
