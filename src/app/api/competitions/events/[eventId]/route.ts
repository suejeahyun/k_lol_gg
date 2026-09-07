import { isEventUuid } from "@/modules/competitions/events";
import { eventNotFoundResponse, eventReadResponse, eventUnavailableResponse } from "@/modules/competitions/events/infrastructure/event-http";
import { getRuntimeEvent } from "@/modules/competitions/events/infrastructure/runtime-event";

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!isEventUuid(eventId)) return eventNotFoundResponse();
  const runtime = getRuntimeEvent();
  if (!runtime) return eventUnavailableResponse();
  try {
    const event = await runtime.repository.getPublic(eventId.toLocaleLowerCase("en-US"), new Date());
    return event ? eventReadResponse({ event }, event.revision) : eventNotFoundResponse();
  } catch { return eventUnavailableResponse(); }
}
