import { getRuntimeEvent } from "@/modules/competitions/events/infrastructure/runtime-event";
import { isEventUuid } from "@/modules/competitions/events";
import { eventErrorResponse, eventMutationResponse, eventNotFoundResponse, eventReadResponse, eventUnavailableResponse, prepareEventMutation, requireEventApiSession } from "@/modules/competitions/events/infrastructure/event-http";

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireEventApiSession("USER");
  if (!auth.ok) return auth.response;
  const runtime = getRuntimeEvent();
  if (!runtime) return eventUnavailableResponse();
  const { eventId } = await params;
  if (!isEventUuid(eventId)) return eventNotFoundResponse();
  try {
    const application = await runtime.repository.getOwnApplication(eventId, auth.session.userId);
    return application ? eventReadResponse({ application }, application.eventRevision) : eventNotFoundResponse();
  } catch (error) { return eventErrorResponse(error); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireEventApiSession("USER");
  if (!auth.ok) return auth.response;
  const prepared = await prepareEventMutation(request, auth.session, "event:application:upsert");
  if (!prepared.ok) return prepared.response;
  const runtime = getRuntimeEvent();
  if (!runtime) return eventUnavailableResponse(prepared.value.traceId);
  const { eventId } = await params;
  if (!isEventUuid(eventId)) return eventNotFoundResponse(prepared.value.traceId);
  try {
    const playerId = await runtime.repository.getOwnedPlayerId(auth.session.userId);
    if (!playerId) return eventNotFoundResponse(prepared.value.traceId);
    return eventMutationResponse(await runtime.service.upsertOwnApplication(prepared.value.context, eventId, playerId, prepared.value.expectedRevision, prepared.value.body), prepared.value.traceId);
  } catch (error) { return eventErrorResponse(error, prepared.value.traceId); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireEventApiSession("USER");
  if (!auth.ok) return auth.response;
  const prepared = await prepareEventMutation(request, auth.session, "event:application:cancel");
  if (!prepared.ok) return prepared.response;
  const { eventId } = await params;
  if (!isEventUuid(eventId)) return eventNotFoundResponse(prepared.value.traceId);
  const runtime = getRuntimeEvent();
  if (!runtime) return eventUnavailableResponse(prepared.value.traceId);
  try { return eventMutationResponse(await runtime.service.cancelOwnApplication(prepared.value.context, eventId, prepared.value.expectedRevision), prepared.value.traceId); }
  catch (error) { return eventErrorResponse(error, prepared.value.traceId); }
}
