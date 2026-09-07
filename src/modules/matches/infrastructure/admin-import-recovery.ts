export const ADMIN_IMPORT_RECOVERY_STORAGE_KEY = "klol-v2:admin-match-import:pending:v1";
export const ADMIN_IMPORT_RECOVERY_TTL_MS = 2 * 60 * 60 * 1_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,159}$/;

export type AdminImportRecovery = Readonly<{
  submissionId: string;
  revision: number;
  uploadKey: string;
  expiresAt: number;
}>;

export type AdminImportRecoveryStorage = Readonly<{
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}>;

function browserStorage(): AdminImportRecoveryStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function serializeAdminImportRecovery(
  input: Omit<AdminImportRecovery, "expiresAt">,
  now = Date.now(),
) {
  return JSON.stringify({
    submissionId: input.submissionId.toLocaleLowerCase("en-US"),
    revision: input.revision,
    uploadKey: input.uploadKey,
    expiresAt: now + ADMIN_IMPORT_RECOVERY_TTL_MS,
  });
}

export function parseAdminImportRecovery(raw: string | null, now = Date.now()): AdminImportRecovery | null {
  if (raw === null || raw.length < 2 || raw.length > 1_024) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).sort().join(",") !== "expiresAt,revision,submissionId,uploadKey") return null;
    if (
      typeof record.submissionId !== "string" ||
      !UUID_PATTERN.test(record.submissionId) ||
      !Number.isSafeInteger(record.revision) ||
      Number(record.revision) < 0 ||
      typeof record.uploadKey !== "string" ||
      !IDEMPOTENCY_PATTERN.test(record.uploadKey) ||
      typeof record.expiresAt !== "number" ||
      !Number.isSafeInteger(record.expiresAt) ||
      record.expiresAt <= now ||
      record.expiresAt > now + ADMIN_IMPORT_RECOVERY_TTL_MS
    ) return null;
    return {
      submissionId: record.submissionId.toLocaleLowerCase("en-US"),
      revision: Number(record.revision),
      uploadKey: record.uploadKey,
      expiresAt: record.expiresAt,
    };
  } catch {
    return null;
  }
}

export function loadAdminImportRecovery(
  now = Date.now(),
  storage: AdminImportRecoveryStorage | null = browserStorage(),
) {
  if (!storage) return null;
  try {
    return parseAdminImportRecovery(storage.getItem(ADMIN_IMPORT_RECOVERY_STORAGE_KEY), now);
  } catch {
    return null;
  }
}

export function saveAdminImportRecovery(
  input: Omit<AdminImportRecovery, "expiresAt">,
  now = Date.now(),
  storage: AdminImportRecoveryStorage | null = browserStorage(),
) {
  if (!storage) return false;
  try {
    storage.setItem(ADMIN_IMPORT_RECOVERY_STORAGE_KEY, serializeAdminImportRecovery(input, now));
    return true;
  } catch {
    return false;
  }
}

export function clearAdminImportRecovery(
  storage: AdminImportRecoveryStorage | null = browserStorage(),
) {
  if (!storage) return false;
  try {
    storage.removeItem(ADMIN_IMPORT_RECOVERY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
