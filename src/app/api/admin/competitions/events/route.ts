import { parseEventListQuery } from "@/modules/competitions/events";
import { eventErrorResponse, eventInvalidResponse, eventMutationResponse, eventReadResponse, eventUnavailableResponse, prepareEventMutation, requireEventApiSession } from "@/modules/competitions/events/infrastructure/event-http";
import { getRuntimeEvent } from "@/modules/competitions/events/infrastructure/runtime-event";

export async function GET(request: Request) {
  const auth = await requireEventApiSession("ADMIN");
  if (!auth.ok) return auth.response;
  const query = parseEventListQuery(request.url);
  if (!query) return eventInvalidResponse();
  const runtime = getRuntimeEvent();
  if (!runtime) return eventUnavailableResponse();
  try { return eventReadResponse(await runtime.repository.listAdmin(query, new Date())); }
  catch { return eventUnavailableResponse(); }
}

export async function POST(request: Request) {
  const auth = await requireEventApiSession("ADMIN");
  if (!auth.ok) return auth.response;
  const prepared = await prepareEventMutation(request, auth.session, "admin:event:create");
  if (!prepared.ok) return prepared.response;
  if (prepared.value.expectedRevision !== 0) return eventInvalidResponse(prepared.value.traceId);
  const runtime = getRuntimeEvent();
  if (!runtime) return eventUnavailableResponse(prepared.value.traceId);
  try { return eventMutationResponse(await runtime.service.create(prepared.value.context, prepared.value.body), prepared.value.traceId); }
  catch (error) { return eventErrorResponse(error, prepared.value.traceId); }
}
