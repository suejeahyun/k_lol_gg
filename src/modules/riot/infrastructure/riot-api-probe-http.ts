import { noStoreJsonResponse } from "@/platform/http";
import { verifyOperationsJobHttpRequest } from "@/modules/operations/infrastructure/signed-job-http";

export type RiotApiProbeInput = Extract<Awaited<ReturnType<typeof verifyOperationsJobHttpRequest>>, { ok: true }>;
export async function handleRiotApiProbeRequest(request: Request, dependencies: Readonly<{
  run: (input: RiotApiProbeInput) => Promise<{ status: number; body: Readonly<Record<string, unknown>> }>;
}>) {
  const verified = await verifyOperationsJobHttpRequest(request, "/api/internal/jobs/riot-api-probe");
  if (!verified.ok || Object.keys(verified.body).length !== 0) return noStoreJsonResponse({ code: "JOB_AUTH_FAILED" }, { status: 401 });
  try {
    const result = await dependencies.run(verified);
    return noStoreJsonResponse(result.body, { status: result.status,
      ...(result.status === 429 ? { headers: { "Retry-After": "300" } } : {}) });
  } catch {
    return noStoreJsonResponse({ code: "RIOT_PROBE_UNAVAILABLE" }, { status: 503 });
  }
}
