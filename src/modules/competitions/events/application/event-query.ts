import { EVENT_FORMATS, type EventAggregate } from "../domain/event";
import type { CompetitionPlayerOption } from "../../core";
import type { OwnEventApplicationDto, PublicEventDto } from "./public-event-dto";

export const EVENT_PUBLIC_STATUSES = [
  "PLANNED",
  "RECRUITING",
  "TEAM_BUILDING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const satisfies readonly EventAggregate["lifecycle"]["status"][];

export type EventListQuery = Readonly<{
  query: string;
  status: EventAggregate["lifecycle"]["status"] | null;
  format: EventAggregate["settings"]["format"] | null;
  page: number;
  pageSize: 12 | 24 | 48;
}>;

export type EventPage = Readonly<{
  items: readonly PublicEventDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}>;

export type EventAdminWorkspace = Readonly<{
  event: EventAggregate;
  playerOptions: readonly CompetitionPlayerOption[];
  playerLabels: Readonly<Record<string, string>>;
}>;

export interface EventQueryRepository {
  listPublic(query: EventListQuery, now: Date): Promise<EventPage>;
  getPublic(eventId: string, now: Date): Promise<PublicEventDto | null>;
  getOwnApplication(eventId: string, ownerUserAccountId: string): Promise<OwnEventApplicationDto | null>;
  listAdmin(query: EventListQuery, now: Date): Promise<EventPage>;
  getAdmin(eventId: string): Promise<EventAggregate | null>;
  getAdminWorkspace(eventId: string): Promise<EventAdminWorkspace | null>;
}

const ALLOWED = new Set(["q", "status", "format", "page", "pageSize"]);

export function parseEventListQuery(input: string): EventListQuery | null {
  const url = new URL(input);
  if ([...url.searchParams.keys()].some((key) => !ALLOWED.has(key))) return null;
  for (const key of ALLOWED) if (url.searchParams.getAll(key).length > 1) return null;
  const query = (url.searchParams.get("q") ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ");
  const status = url.searchParams.get("status");
  const format = url.searchParams.get("format");
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "12");
  if (
    query.length > 64 || /[\u0000-\u001f\u007f-\u009f]/u.test(query) ||
    (status !== null && !EVENT_PUBLIC_STATUSES.includes(status as never)) ||
    (format !== null && !EVENT_FORMATS.includes(format as never)) ||
    !Number.isSafeInteger(page) || page < 1 || page > 10_000 ||
    ![12, 24, 48].includes(pageSize)
  ) return null;
  return {
    query,
    status: status as EventListQuery["status"],
    format: format as EventListQuery["format"],
    page,
    pageSize: pageSize as EventListQuery["pageSize"],
  };
}

export function isEventUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
