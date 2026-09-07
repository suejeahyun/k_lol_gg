import { parseDestructionListQuery } from "@/modules/competitions/destruction";
import { destructionInvalidResponse, destructionReadResponse, destructionUnavailableResponse } from "@/modules/competitions/destruction/destruction-http";
import { getRuntimeDestruction } from "@/modules/competitions/destruction/runtime-destruction";

export async function GET(request: Request) {
  const query = parseDestructionListQuery(request.url);
  if (!query) return destructionInvalidResponse();
  const runtime = getRuntimeDestruction();
  if (!runtime) return destructionUnavailableResponse();
  try { return destructionReadResponse(await runtime.repository.listPublic(query)); }
  catch { return destructionUnavailableResponse(); }
}
