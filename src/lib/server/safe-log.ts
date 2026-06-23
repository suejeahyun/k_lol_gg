type LogDetails = Record<string, unknown>;

function isEnabled() {
  const value = String(process.env.KLOL_SERVER_ERROR_LOGS ?? "true").toLowerCase();
  return !["0", "false", "off", "no"].includes(value);
}

function includeStack() {
  const value = String(process.env.KLOL_SERVER_ERROR_STACK ?? "").toLowerCase();
  if (process.env.NODE_ENV !== "production") return value !== "false";
  return ["1", "true", "on", "yes"].includes(value);
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: includeStack() ? error.stack : undefined,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
}

function cleanDetails(details?: LogDetails) {
  if (!details) return undefined;

  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

export function logServerError(label: string, error: unknown, details?: LogDetails) {
  if (!isEnabled()) return;

  console.error(label, {
    ...cleanDetails(details),
    error: normalizeError(error),
  });
}
