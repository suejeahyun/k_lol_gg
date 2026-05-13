import { prisma } from "@/lib/prisma/client";

type RiotStatusInput = {
  scope: string;
  ok: boolean;
  statusCode?: number | null;
  statusText?: string | null;
  message?: string | null;
  retryAfterSec?: number | null;
};

function getStatusCode(error: unknown) {
  if (typeof error === "object" && error && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    return Number.isInteger(status) ? status : null;
  }
  return null;
}

function getStatusText(error: unknown) {
  if (error instanceof Error) return error.name;
  return null;
}

export function getRiotStatusFromError(scope: string, error: unknown): RiotStatusInput {
  return {
    scope,
    ok: false,
    statusCode: getStatusCode(error),
    statusText: getStatusText(error),
    message: error instanceof Error ? error.message : String(error ?? "UNKNOWN_ERROR"),
    retryAfterSec: null,
  };
}

export async function recordRiotApiStatus(input: RiotStatusInput) {
  try {
    const now = new Date();
    const updateData = input.ok
      ? {
          statusCode: input.statusCode ?? null,
          statusText: input.statusText ?? null,
          message: input.message ?? null,
          retryAfterSec: input.retryAfterSec ?? null,
          requestCount: { increment: 1 },
          lastSuccessAt: now,
        }
      : {
          statusCode: input.statusCode ?? null,
          statusText: input.statusText ?? null,
          message: input.message ?? null,
          retryAfterSec: input.retryAfterSec ?? null,
          requestCount: { increment: 1 },
          failureCount: { increment: 1 },
          lastFailureAt: now,
        };

    await prisma.riotApiStatus.upsert({
      where: { scope: input.scope },
      update: updateData,
      create: {
        scope: input.scope,
        statusCode: input.statusCode ?? null,
        statusText: input.statusText ?? null,
        message: input.message ?? null,
        retryAfterSec: input.retryAfterSec ?? null,
        requestCount: 1,
        failureCount: input.ok ? 0 : 1,
        lastSuccessAt: input.ok ? now : null,
        lastFailureAt: input.ok ? null : now,
      },
    });
  } catch (statusError) {
    console.error("[RIOT_API_STATUS_RECORD_ERROR]", statusError);
  }
}
