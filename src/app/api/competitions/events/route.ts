import { parseEventListQuery } from "@/modules/competitions/events";
import { eventInvalidResponse, eventReadResponse, eventUnavailableResponse } from "@/modules/competitions/events/infrastructure/event-http";
import { getRuntimeEvent } from "@/modules/competitions/events/infrastructure/runtime-event";

export async function GET(request: Request) {
  const query = parseEventListQuery(request.url);
  if (!query) return eventInvalidResponse();
  const runtime = getRuntimeEvent();
  if (!runtime) return eventUnavailableResponse();
  try { return eventReadResponse(await runtime.repository.listPublic(query, new Date())); }
  catch { return eventUnavailableResponse(); }
}
