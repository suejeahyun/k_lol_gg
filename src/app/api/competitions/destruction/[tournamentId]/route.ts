import { isDestructionUuid } from "@/modules/competitions/destruction";
import { destructionNotFoundResponse, destructionReadResponse, destructionUnavailableResponse } from "@/modules/competitions/destruction/destruction-http";
import { getRuntimeDestruction } from "@/modules/competitions/destruction/runtime-destruction";

export async function GET(_request: Request, { params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = await params;
  if (!isDestructionUuid(tournamentId)) return destructionNotFoundResponse();
  const runtime = getRuntimeDestruction();
  if (!runtime) return destructionUnavailableResponse();
  try {
    const destruction = await runtime.repository.getPublic(tournamentId);
    return destruction ? destructionReadResponse({ destruction }, destruction.revision) : destructionNotFoundResponse();
  } catch { return destructionUnavailableResponse(); }
}
