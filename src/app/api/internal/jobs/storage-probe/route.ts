import { runStorageProbeJob } from "@/modules/operations/infrastructure/storage-probe-job";
import { handleStorageProbeRequest } from "@/modules/operations/infrastructure/storage-probe-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleStorageProbeRequest(request, { runJob: runStorageProbeJob });
}
