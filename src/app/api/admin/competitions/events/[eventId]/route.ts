import { eventErrorResponse, eventMutationResponse, eventNotFoundResponse, eventReadResponse, eventUnavailableResponse, prepareEventMutation, requireEventApiSession } from "@/modules/competitions/events/infrastructure/event-http";
import { getRuntimeEvent } from "@/modules/competitions/events/infrastructure/runtime-event";
import { isEventUuid } from "@/modules/competitions/events";

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireEventApiSession("ADMIN");
  if (!auth.ok) return auth.response;
  const runtime = getRuntimeEvent();
  if (!runtime) return eventUnavailableResponse();
  const { eventId } = await params;
  if (!isEventUuid(eventId)) return eventNotFoundResponse();
  try {
    const event = await runtime.repository.getAdmin(eventId);
    return event ? eventReadResponse({ event }, event.revision) : eventNotFoundResponse();
  } catch (error) { return eventErrorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireEventApiSession("ADMIN");
  if (!auth.ok) return auth.response;
  const prepared = await prepareEventMutation(request, auth.session, "admin:event:command");
  if (!prepared.ok) return prepared.response;
  const runtime = getRuntimeEvent();
  if (!runtime) return eventUnavailableResponse(prepared.value.traceId);
  const { eventId } = await params;
  if (!isEventUuid(eventId)) return eventNotFoundResponse(prepared.value.traceId);
  try { return eventMutationResponse(await runtime.service.executeAdmin(prepared.value.context, eventId, prepared.value.expectedRevision, prepared.value.body), prepared.value.traceId); }
  catch (error) { return eventErrorResponse(error, prepared.value.traceId); }
}
