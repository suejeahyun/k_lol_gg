import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMUNITY_NETWORK_LIMITS, createCommunityNetworkSnapshot, parseCommunityNetworkInput,
  toCommunityNetworkPublicDirectory, updateCommunityNetworkSnapshot,
  type CommunityNetworkCommunity, type CommunityNetworkInput, type CommunityNetworkRoom,
} from "../src/modules/community-network/domain/community-network";
import { isCommunityNetworkEnabled } from "../src/modules/community-network/infrastructure/runtime-policy";

const community: CommunityNetworkCommunity = {
  id: "10000000-0000-4000-8000-000000000001", slug: "alpha", name: "Alpha", origin: "https://alpha.example", description: "Public introduction", state: "LISTED",
};
const room = (ordinal: number, overrides: Partial<CommunityNetworkRoom> = {}): CommunityNetworkRoom => ({
  id: `20000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`, communityId: community.id,
  displayName: `Private room ${ordinal}`, purpose: "CHAT", dataGroupKey: "private-group", active: true, ...overrides,
});
const input = (overrides: Partial<CommunityNetworkInput> = {}): CommunityNetworkInput => ({ communities: [community], rooms: [room(1)], ...overrides });

test("registry starts empty and supports twelve rooms without fixed service names or room counts", () => {
  const empty = createCommunityNetworkSnapshot({ communities: [], rooms: [] }, 0);
  assert.equal(empty.communities.length, 0);
  const value = input({ rooms: Array.from({ length: 12 }, (_, index) => room(index + 1)) });
  const next = updateCommunityNetworkSnapshot(empty, value, 0);
  assert.equal(next.revision, 1);
  assert.equal(next.rooms.length, 12);
  assert.equal(next.connectionStatus, "UNVERIFIED");
  assert.equal(next.routingStatus, "NOT_APPLIED");
  assert.equal(empty.rooms.length, 0);
});

test("canonical slug and HTTPS origin normalization also detects equivalent duplicates", () => {
  const normalized = parseCommunityNetworkInput(input({ communities: [{ ...community, slug: "ALPHA", origin: "https://ALPHA.example:443/" }] }));
  assert.equal(normalized.communities[0].slug, "alpha");
  assert.equal(normalized.communities[0].origin, "https://alpha.example");
  for (const duplicate of [
    { ...community, id: "10000000-0000-4000-8000-000000000002", slug: "ALPHA", origin: "https://other.example" },
    { ...community, id: "10000000-0000-4000-8000-000000000002", slug: "other", origin: "https://ALPHA.example:443/" },
    { ...community, slug: "other", origin: "https://other.example" },
  ]) assert.throws(() => parseCommunityNetworkInput(input({ communities: [community, duplicate] })), /INVALID_/);
});

test("origins reject credentials, non-HTTPS, URL paths, queries, fragments and repaired spellings", () => {
  for (const origin of ["http://example.test", "https://user:secret@example.test", "https://example.test/path", "https://example.test?key=secret", "https://example.test/#x", "https:example.test", "https:/example.test", "https://example.test\\path"]) {
    assert.throws(() => parseCommunityNetworkInput(input({ communities: [{ ...community, origin }] })), /INVALID_/, origin);
  }
});

test("unknown identity, authentication and phone-routing fields cannot enter registry input", () => {
  for (const forbidden of ["shortcutId", "threadId", "apiKey", "identityKey", "connectionStatus", "routingStatus", "revision"]) {
    assert.throws(() => parseCommunityNetworkInput({ ...input(), [forbidden]: "test" }), /INVALID_/);
    assert.throws(() => parseCommunityNetworkInput({ ...input(), communities: [{ ...community, [forbidden]: "test" }] }), /INVALID_/);
    assert.throws(() => parseCommunityNetworkInput({ ...input(), rooms: [{ ...room(1), [forbidden]: "test" }] }), /INVALID_/);
  }
});

test("room references, UUIDs, exact booleans and purpose values are validated", () => {
  for (const patch of [
    { id: "not-a-uuid" }, { id: `${room(1).id}\n` }, { communityId: "10000000-0000-4000-8000-000000000009" },
    { purpose: "UNKNOWN" }, { purpose: ["CHAT"] }, { active: "true" }, { displayName: "hidden\u200broom" }, { dataGroupKey: "group name" },
  ]) assert.throws(() => parseCommunityNetworkInput({ ...input(), rooms: [{ ...room(1), ...patch }] }), /INVALID_/);
  assert.throws(() => parseCommunityNetworkInput(input({ rooms: [room(1), room(1)] })), /INVALID_/);
  assert.throws(() => parseCommunityNetworkInput({ ...input(), communities: [{ ...community, state: ["LISTED"] }] }), /INVALID_/);
});

test("operational caps are explicit and input beyond each cap fails closed", () => {
  assert.equal(COMMUNITY_NETWORK_LIMITS.requestBytes, 524_288);
  assert.throws(() => parseCommunityNetworkInput(input({ rooms: Array.from({ length: COMMUNITY_NETWORK_LIMITS.rooms + 1 }, (_, index) => room(index + 1)) })), /INVALID_/);
  assert.throws(() => parseCommunityNetworkInput({ communities: Array(COMMUNITY_NETWORK_LIMITS.communities + 1).fill(community), rooms: [] }), /INVALID_/);
});

test("public descriptions preserve LF, normalize CRLF and reject other control characters", () => {
  const parsed = parseCommunityNetworkInput(input({ communities: [{ ...community, description: "Line one\r\nLine two\nLine three" }] }));
  assert.equal(parsed.communities[0].description, "Line one\nLine two\nLine three");
  for (const description of ["hello\rworld", "hello\tworld", "hello\u0000world", "hello\u200bworld", "a".repeat(601)]) {
    assert.throws(() => parseCommunityNetworkInput(input({ communities: [{ ...community, description }] })), /INVALID_/);
  }
});

test("stale revisions, omitted stable IDs and room reassignment cannot overwrite registry history", () => {
  const current = createCommunityNetworkSnapshot(input(), 4);
  assert.throws(() => updateCommunityNetworkSnapshot(current, input(), 3), /STALE_COMMUNITY_NETWORK_REVISION/);
  assert.throws(() => updateCommunityNetworkSnapshot(current, { communities: [], rooms: [] }, 4), /REMOVAL_FORBIDDEN/);
  assert.throws(() => updateCommunityNetworkSnapshot(current, input({ rooms: [] }), 4), /REMOVAL_FORBIDDEN/);
  const second = { ...community, id: "10000000-0000-4000-8000-000000000002", slug: "beta", origin: "https://beta.example" };
  assert.throws(() => updateCommunityNetworkSnapshot(current, input({ communities: [community, second], rooms: [room(1, { communityId: second.id })] }), 4), /ROOM_MOVE_FORBIDDEN/);
});

test("archiving preserves identity and requires deactivating every room", () => {
  const archived = { ...community, state: "ARCHIVED" as const };
  assert.throws(() => parseCommunityNetworkInput(input({ communities: [archived] })), /INVALID_/);
  const current = createCommunityNetworkSnapshot(input(), 0);
  const next = updateCommunityNetworkSnapshot(current, input({ communities: [archived], rooms: [room(1, { active: false })] }), 0);
  assert.equal(next.communities[0].id, community.id);
  assert.equal(next.rooms[0].id, room(1).id);
  assert.equal(next.rooms[0].active, false);
});

test("public projection exposes listed introductions only, never private room metadata", () => {
  const snapshot = createCommunityNetworkSnapshot(input({ communities: [community,
    { ...community, id: "10000000-0000-4000-8000-000000000002", slug: "draft", origin: "https://draft.example", state: "DRAFT" },
    { ...community, id: "10000000-0000-4000-8000-000000000003", slug: "archived", origin: "https://archived.example", state: "ARCHIVED" },
  ] }), 3);
  const directory = toCommunityNetworkPublicDirectory(snapshot);
  assert.equal(directory.length, 1);
  assert.deepEqual(Object.keys(directory[0]).sort(), ["connectionStatus", "description", "id", "name", "origin", "routingStatus", "slug"]);
  assert.doesNotMatch(JSON.stringify(directory), /Private room|private-group|draft|archived|rooms|communityId|state/);
});

test("runtime feature is disabled by default and accepts only explicit lowercase true", () => {
  for (const value of [undefined, "", "false", "TRUE", "1", " true "]) assert.equal(isCommunityNetworkEnabled({ COMMUNITY_NETWORK_ENABLED: value }), false);
  assert.equal(isCommunityNetworkEnabled({ COMMUNITY_NETWORK_ENABLED: "true" }), true);
});
