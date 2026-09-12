import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { EventService, parseEventListQuery, type EventCommand, type EventCommandContext } from "../src/modules/competitions/events";

const actorSession = { userAccountId: randomUUID(), sessionId: randomUUID(), role: "ADMIN", authVersion: 0 } as const;
const context: EventCommandContext = { actorSession, purpose: "ADMIN", requestId: randomUUID(), idempotencyMaterial: new TextEncoder().encode("stable-key") };

test("event public query rejects duplicate and unknown filters", () => {
  assert.deepEqual(parseEventListQuery("https://v2.example/competitions?format=ARAM&status=RECRUITING&pageSize=24"), {
    query: "", format: "ARAM", status: "RECRUITING", page: 1, pageSize: 24,
  });
  assert.equal(parseEventListQuery("https://v2.example/competitions?next=//evil"), null);
  assert.equal(parseEventListQuery("https://v2.example/competitions?status=PLANNED&status=COMPLETED"), null);
});

test("event service creates a server-fingerprinted command and rejects unstable identifiers or even BO", async () => {
  const commands: EventCommand[] = [];
  const service = new EventService({ handle: async (command) => {
    commands.push(command);
    return { body: { eventId: command.eventId, revision: 1, status: "PLANNED", commandType: command.type }, revision: 1, replayed: false };
  } });
  const eventId = randomUUID();
  const body = { eventId, settings: {
    title: "하늘빛 이벤트전", description: null, format: "ARAM",
    recruitmentOpensAt: "2026-09-07T00:00:00.000Z", recruitmentClosesAt: "2026-09-08T00:00:00.000Z", bracketBestOf: 9,
  } };
  await service.create(context, body);
  assert.equal(commands[0]?.eventId, eventId);
  assert.equal(commands[0]?.metadata.idempotency.requestFingerprint.byteLength, 32);
  assert.throws(() => service.create(context, { ...body, eventId: undefined }), TypeError);
  assert.throws(() => service.create(context, { ...body, settings: { ...body.settings, bracketBestOf: 2 } }), TypeError);
});

test("own application requires a stable participant UUID so retry fingerprints cannot drift", async () => {
  const ownerContext: EventCommandContext = {
    actorSession: { userAccountId: randomUUID(), sessionId: randomUUID(), role: "USER", authVersion: 0 },
    purpose: "ACCOUNT",
    requestId: randomUUID(),
    idempotencyMaterial: new TextEncoder().encode("owner-key"),
  };
  const commands: EventCommand[] = [];
  const service = new EventService({ handle: async (command) => {
    commands.push(command);
    return { body: { eventId: command.eventId, revision: 2, status: "RECRUITING", commandType: command.type }, revision: 2, replayed: false };
  } });
  const eventId = randomUUID();
  const playerId = randomUUID();
  const participantId = randomUUID();
  const body = { participantId, mainPosition: "MID", subPositions: ["ADC"] };
  await service.upsertOwnApplication(ownerContext, eventId, playerId, 1, body);
  await service.upsertOwnApplication(ownerContext, eventId, playerId, 1, body);
  assert.deepEqual(commands[0]?.metadata.idempotency.requestFingerprint, commands[1]?.metadata.idempotency.requestFingerprint);
  assert.throws(() => service.upsertOwnApplication(ownerContext, eventId, playerId, 1, { mainPosition: "MID", subPositions: [] }), TypeError);
});

test("event gallery command accepts only an exact nullable gallery identifier", async () => {
  const commands: EventCommand[] = [];
  const service = new EventService({ handle: async (command) => {
    commands.push(command);
    return { body: { eventId: command.eventId, revision: 2, status: "IN_PROGRESS", commandType: command.type }, revision: 2, replayed: false };
  } });
  const eventId = randomUUID();
  const galleryId = randomUUID();
  await service.executeAdmin(context, eventId, 1, { type: "SET_MEDIA_GALLERY", payload: { galleryId } });
  await service.executeAdmin(context, eventId, 1, { type: "SET_MEDIA_GALLERY", payload: { galleryId: null } });
  assert.equal(commands[0]?.type, "SET_MEDIA_GALLERY");
  assert.deepEqual(commands.map((command) => command.payload), [{ galleryId }, { galleryId: null }]);
  assert.throws(() => service.executeAdmin(context, eventId, 1, { type: "SET_MEDIA_GALLERY", payload: { galleryId, extra: true } }), TypeError);
});
