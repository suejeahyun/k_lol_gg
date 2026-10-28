import assert from "node:assert/strict";
import test from "node:test";
import { captureFixtureRosterSnapshot, replaceDestructionParticipant } from "../src/modules/competitions/destruction/roster-history";
import { participantAuctionRating } from "../src/modules/competitions/destruction/provisional-rating";
import type { DestructionParticipant } from "../src/modules/competitions/destruction/teams";

const instant = "2026-10-28T00:00:00.000Z";
const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
function roster(teamId: string): DestructionParticipant[] {
  return positions.map((position, index) => ({
    id: `${teamId}-seat-${index}`, playerId: `${teamId}-player-${index}`, position,
    teamId, isCaptain: index === 0, auctionStatus: index === 0 ? "ASSIGNED" : "SOLD",
    purchasePoints: index === 0 ? 0 : 300, drawOrder: index === 0 ? null : index,
  }));
}

for (const gameMode of ["ARAM", "ARAM_MAYHEM"] as const) {
  test(`${gameMode} replacement never attributes the outgoing player's ratings, account link or self-reported record to the incoming player`, () => {
    const first = roster("team-a");
    first[1] = { ...first[1]!,
      provisionalRating: { policy: { version: "ABSOLUTE_V3", weights: { aram: 0, solo: 100, inhouse: 0, champions: 0, challenges: 0 } },
        components: { solo: { score: 90, status: "READY", source: "RIOT", samples: 1, evidence: "synthetic-old-player-only", observedAt: instant } },
        collectedAt: instant, linkId: "old-player-link", linkRevision: 7 },
      ratingCollection: { attempts: 2, complete: true, error: null, retryAt: instant },
      selfReportedRecord: { mode: gameMode, wins: 200, losses: 100, submittedAt: instant },
      aramRecord: { mode: gameMode, source: "ADMIN_VERIFIED", wins: 60, losses: 40, fetchedAt: instant, evidence: "synthetic-legacy-evidence" },
      aramCollection: { linkId: "old-player-link", linkRevision: 7, matchIds: ["synthetic-match"], processed: 1, wins: 1, losses: 0, excluded: 0, startedAt: instant },
      minimumBid: 300,
    };
    const participants = [...first, ...roster("team-b")];
    const before = JSON.stringify(participants);
    assert.equal(participantAuctionRating(first[1]!)?.tier, "S");
    const snapshot = captureFixtureRosterSnapshot({ fixtureId: "played-fixture", teamAId: "team-a", teamBId: "team-b", participants, configuration: { gameMode }, capturedAt: instant });
    const snapshots = [snapshot];
    const result = replaceDestructionParticipant({ replacementId: "replacement-1", participantId: first[1]!.id,
      incomingPlayerId: "incoming-player", incomingPosition: null, reason: "선수 교체", effectiveAt: instant,
      participants, replacements: [], fixtureSnapshots: snapshots, configuration: { gameMode } });
    const incoming = result.participants.find((participant) => participant.id === first[1]!.id)!;
    assert.equal(incoming.playerId, "incoming-player");
    assert.equal(participantAuctionRating(incoming), null, "a new player's rating must remain unknown until independently established");
    for (const field of ["provisionalRating", "ratingCollection", "selfReportedRecord", "aramRecord", "aramCollection", "minimumBid"] as const) {
      assert.equal(incoming[field], undefined, field);
    }
    assert.equal(incoming.purchasePoints, first[1]!.purchasePoints, "the historical price belongs to the roster seat and is not repriced");
    assert.equal(incoming.teamId, first[1]!.teamId);
    assert.equal(result.fixtureSnapshots, snapshots);
    assert.equal(snapshot.teamA.find((member) => member.participantId === first[1]!.id)?.playerId, first[1]!.playerId);
    assert.equal(result.replacements[0]?.outgoingPlayerId, first[1]!.playerId);
    assert.equal(JSON.stringify(participants), before);
  });
}
