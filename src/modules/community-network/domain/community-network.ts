export const COMMUNITY_NETWORK_LIMITS = Object.freeze({ communities: 100, rooms: 500, requestBytes: 512 * 1_024 });
export const COMMUNITY_NETWORK_CONNECTION_STATUS = "UNVERIFIED" as const;
export const COMMUNITY_NETWORK_ROUTING_STATUS = "NOT_APPLIED" as const;

export type CommunityNetworkCommunity = Readonly<{
  id: string;
  slug: string;
  name: string;
  origin: string;
  description: string;
  state: "DRAFT" | "LISTED" | "ARCHIVED";
}>;

export type CommunityNetworkRoom = Readonly<{
  id: string;
  communityId: string;
  displayName: string;
  purpose: "CHAT" | "RECRUIT" | "EVENT" | "NOTICE";
  dataGroupKey: string;
  active: boolean;
}>;

export type CommunityNetworkInput = Readonly<{
  communities: readonly CommunityNetworkCommunity[];
  rooms: readonly CommunityNetworkRoom[];
}>;

export type CommunityNetworkSnapshot = CommunityNetworkInput & Readonly<{
  revision: number;
  connectionStatus: typeof COMMUNITY_NETWORK_CONNECTION_STATUS;
  routingStatus: typeof COMMUNITY_NETWORK_ROUTING_STATUS;
}>;

export type CommunityNetworkPublicCommunity = Pick<CommunityNetworkCommunity, "id" | "slug" | "name" | "origin" | "description"> & Readonly<{
  connectionStatus: typeof COMMUNITY_NETWORK_CONNECTION_STATUS;
  routingStatus: typeof COMMUNITY_NETWORK_ROUTING_STATUS;
}>;

export class CommunityNetworkError extends Error {
  constructor(readonly code: string) { super(code); }
}

function fail(code = "INVALID_COMMUNITY_NETWORK_INPUT"): never { throw new CommunityNetworkError(code); }

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key))) return fail();
  return result;
}

function text(value: unknown, maximum: number, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > maximum || /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(value)) return fail();
  const normalized = value.trim();
  if ((!allowEmpty && !normalized) || normalized.length > maximum) return fail();
  return normalized;
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || value.length !== 36 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) return fail();
  return value.toLowerCase();
}

function description(value: unknown): string {
  if (typeof value !== "string") return fail();
  const normalized = value.replaceAll("\r\n", "\n");
  // Public descriptions may contain ordinary line breaks, but not hidden/control characters.
  text(normalized.replaceAll("\n", ""), 600, true);
  if (normalized.length > 600) return fail();
  return normalized.trim();
}

function origin(value: unknown): string {
  const candidate = text(value, 300);
  if (!/^https:\/\/[^/?#]+\/?$/iu.test(candidate)) return fail();
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || /[\\\s]/u.test(candidate)) return fail();
    return url.origin;
  } catch { return fail(); }
}

/** Accept only registry metadata. Authentication, identity and phone-routing values have no input fields. */
export function parseCommunityNetworkInput(value: unknown): CommunityNetworkInput {
  const input = record(value, ["communities", "rooms"]);
  if (!Array.isArray(input.communities) || !Array.isArray(input.rooms)
    || input.communities.length > COMMUNITY_NETWORK_LIMITS.communities || input.rooms.length > COMMUNITY_NETWORK_LIMITS.rooms) return fail();
  const communities = input.communities.map((entry): CommunityNetworkCommunity => {
    const item = record(entry, ["id", "slug", "name", "origin", "description", "state"]);
    const slug = text(item.slug, 64).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) || typeof item.state !== "string" || !["DRAFT", "LISTED", "ARCHIVED"].includes(item.state)) return fail();
    return { id: uuid(item.id), slug, name: text(item.name, 80), origin: origin(item.origin), description: description(item.description), state: item.state as CommunityNetworkCommunity["state"] };
  });
  const communityById = new Map(communities.map((item) => [item.id, item]));
  if (communityById.size !== communities.length || new Set(communities.map((item) => item.slug)).size !== communities.length
    || new Set(communities.map((item) => item.origin)).size !== communities.length) return fail();
  const rooms = input.rooms.map((entry): CommunityNetworkRoom => {
    const item = record(entry, ["id", "communityId", "displayName", "purpose", "dataGroupKey", "active"]);
    const communityId = uuid(item.communityId);
    const community = communityById.get(communityId);
    const dataGroupKey = text(item.dataGroupKey, 64);
    if (!community || typeof item.active !== "boolean" || (community.state === "ARCHIVED" && item.active)
      || typeof item.purpose !== "string" || !["CHAT", "RECRUIT", "EVENT", "NOTICE"].includes(item.purpose) || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u.test(dataGroupKey)) return fail();
    return { id: uuid(item.id), communityId, displayName: text(item.displayName, 100), purpose: item.purpose as CommunityNetworkRoom["purpose"], dataGroupKey, active: item.active };
  });
  if (new Set(rooms.map((item) => item.id)).size !== rooms.length) return fail();
  return { communities, rooms };
}

export function createCommunityNetworkSnapshot(input: CommunityNetworkInput, revision: number): CommunityNetworkSnapshot {
  if (!Number.isSafeInteger(revision) || revision < 0) return fail("INVALID_COMMUNITY_NETWORK_REVISION");
  return { ...parseCommunityNetworkInput(input), revision, connectionStatus: COMMUNITY_NETWORK_CONNECTION_STATUS, routingStatus: COMMUNITY_NETWORK_ROUTING_STATUS };
}

export function updateCommunityNetworkSnapshot(current: CommunityNetworkSnapshot, input: CommunityNetworkInput, expectedRevision: number): CommunityNetworkSnapshot {
  if (current.revision !== expectedRevision) return fail("STALE_COMMUNITY_NETWORK_REVISION");
  const parsed = parseCommunityNetworkInput(input);
  const communityIds = new Set(parsed.communities.map((item) => item.id));
  const roomById = new Map(parsed.rooms.map((item) => [item.id, item]));
  if (current.communities.some((item) => !communityIds.has(item.id)) || current.rooms.some((item) => !roomById.has(item.id))) return fail("COMMUNITY_NETWORK_REMOVAL_FORBIDDEN");
  if (current.rooms.some((item) => roomById.get(item.id)?.communityId !== item.communityId)) return fail("COMMUNITY_NETWORK_ROOM_MOVE_FORBIDDEN");
  return createCommunityNetworkSnapshot(parsed, current.revision + 1);
}

export function toCommunityNetworkPublicDirectory(snapshot: Pick<CommunityNetworkSnapshot, "communities">): CommunityNetworkPublicCommunity[] {
  return snapshot.communities.filter((item) => item.state === "LISTED").map(({ id, slug, name, origin, description }) => ({
    id, slug, name, origin, description, connectionStatus: COMMUNITY_NETWORK_CONNECTION_STATUS, routingStatus: COMMUNITY_NETWORK_ROUTING_STATUS,
  }));
}
