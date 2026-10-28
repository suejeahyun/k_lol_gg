import assert from "node:assert/strict";
import test from "node:test";
import {
  addAdminEventParticipants, cancelOwnEventApplication, closeEventRecruitment, createEventAggregate,
  EventDomainError, eventTeamBalanceParticipants, startEventRecruitment, upsertOwnEventApplication,
} from "../src/modules/competitions/events/domain/event";

const now = "2026-10-28T01:00:00.000Z";
function openEvent(format: "POSITION" | "ARAM" = "POSITION") {
  return startEventRecruitment(createEventAggregate({ id: "capacity-event", now, settings: {
    title: "Synthetic capacity event", description: null, format, bracketBestOf: 1,
    recruitmentOpensAt: "2026-10-28T00:00:00.000Z", recruitmentClosesAt: "2026-10-29T00:00:00.000Z",
  } }), now);
}
const participant = (index: number) => ({ id: `participant-${index}`, playerId: `player-${index}`,
  mainPosition: (["TOP", "JGL", "MID", "ADC", "SUP"] as const)[index % 5]!, subPositions: [] });
const capacityError = (error: unknown) => error instanceof EventDomainError && error.code === "PRECONDITION_FAILED";

test("an administrator cannot import an eleven-player roster that cannot advance to team building", () => {
  const event = openEvent();
  assert.throws(() => addAdminEventParticipants(event, Array.from({ length: 11 }, (_, index) => participant(index)), "ADMIN_IMPORT", now), capacityError);
  assert.equal(event.participants.length, 0);
  const valid = addAdminEventParticipants(event, Array.from({ length: 10 }, (_, index) => participant(index)), "ADMIN_IMPORT", now);
  assert.equal(eventTeamBalanceParticipants(closeEventRecruitment(valid, now)).length, 10);
});

test("the positionless ARAM event uses the same ten-player builder and rejects an oversized import", () => {
  const event = openEvent("ARAM");
  const inputs = Array.from({ length: 11 }, (_, index) => ({ ...participant(index), mainPosition: null }));
  assert.throws(() => addAdminEventParticipants(event, inputs, "ADMIN_IMPORT", now), capacityError);
  const full = addAdminEventParticipants(event, inputs.slice(0, 10), "ADMIN_IMPORT", now);
  assert.equal(eventTeamBalanceParticipants(closeEventRecruitment(full, now)).length, 10);
});

test("manual additions and batches enforce the accumulated active count atomically", () => {
  const nine = addAdminEventParticipants(openEvent(), Array.from({ length: 9 }, (_, index) => participant(index)), "ADMIN_IMPORT", now);
  assert.throws(() => addAdminEventParticipants(nine, [participant(9), participant(10)], "ADMIN_IMPORT", now), capacityError);
  assert.equal(nine.participants.length, 9);
  const full = addAdminEventParticipants(nine, [participant(9)], "ADMIN_MANUAL", now);
  assert.throws(() => addAdminEventParticipants(full, [participant(10)], "ADMIN_MANUAL", now), capacityError);
  assert.throws(() => upsertOwnEventApplication(full, { ...participant(10), ownerUserAccountId: "account-extra" }, now), capacityError);
  assert.equal(full.participants.length, 10);
});

test("an existing active applicant may update preferences when all ten places are occupied", () => {
  const nine = addAdminEventParticipants(openEvent(), Array.from({ length: 9 }, (_, index) => participant(index)), "ADMIN_IMPORT", now);
  const input = { ...participant(9), ownerUserAccountId: "account-owner" };
  const full = upsertOwnEventApplication(nine, input, now);
  const updated = upsertOwnEventApplication(full, { ...input, mainPosition: "TOP" }, now);
  assert.equal(updated.participants.filter((entry) => entry.status === "ACTIVE").length, 10);
  assert.equal(updated.participants.find((entry) => entry.id === input.id)?.mainPosition, "TOP");
});

test("a cancelled applicant may reclaim a free place but cannot revive into a now-full roster", () => {
  const nine = addAdminEventParticipants(openEvent(), Array.from({ length: 9 }, (_, index) => participant(index)), "ADMIN_IMPORT", now);
  const input = { ...participant(9), ownerUserAccountId: "account-owner" };
  const cancelled = cancelOwnEventApplication(upsertOwnEventApplication(nine, input, now), input.ownerUserAccountId, now);
  assert.equal(upsertOwnEventApplication(cancelled, input, now).participants.filter((entry) => entry.status === "ACTIVE").length, 10);
  const refilled = addAdminEventParticipants(cancelled, [participant(10)], "ADMIN_MANUAL", now);
  assert.equal(refilled.participants.length, 11, "cancelled history is retained outside the ten active places");
  assert.throws(() => upsertOwnEventApplication(refilled, input, now), capacityError);
  assert.equal(eventTeamBalanceParticipants(closeEventRecruitment(refilled, now)).length, 10);
});
