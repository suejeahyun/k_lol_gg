import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCompetitionSavedView,
  parseDestructionAdminDetailView,
  parseDestructionDetailView,
  parseEventDetailAction,
} from "../src/modules/competitions/public-navigation";

test("competition saved views only accept one allowlisted type", () => {
  assert.equal(parseCompetitionSavedView(new URLSearchParams()), "event");
  assert.equal(parseCompetitionSavedView(new URLSearchParams("type=destruction")), "destruction");
  assert.equal(parseCompetitionSavedView(new URLSearchParams("type=other")), null);
  assert.equal(parseCompetitionSavedView(new URLSearchParams("type=event&type=destruction")), null);
});

test("event application deep link rejects unrelated and repeated values", () => {
  assert.equal(parseEventDetailAction(new URLSearchParams()), null);
  assert.equal(parseEventDetailAction(new URLSearchParams("action=apply")), "apply");
  assert.equal(parseEventDetailAction(new URLSearchParams("action=remove")), undefined);
  assert.equal(parseEventDetailAction(new URLSearchParams("action=apply&next=%2Fadmin")), undefined);
});

test("destruction detail deep links retain only valid section-bound values", () => {
  assert.deepEqual(parseDestructionDetailView(new URLSearchParams("tab=participants&player=player_01")), {
    action: null, tab: "participants", playerId: "player_01", imageIndex: null,
  });
  assert.deepEqual(parseDestructionDetailView(new URLSearchParams("tab=gallery&imageIndex=4")), {
    action: null, tab: "gallery", playerId: null, imageIndex: 4,
  });
  assert.equal(parseDestructionDetailView(new URLSearchParams("player=player_01")), null);
  assert.equal(parseDestructionDetailView(new URLSearchParams("tab=gallery&image=-1")), null);
  assert.equal(parseDestructionDetailView(new URLSearchParams("tab=mvp&token=secret")), null);
  assert.equal(parseDestructionDetailView(new URLSearchParams("tab=participants&player=a&participant=b")), null);
});

test("administrator live auction view requires the complete exact pair", () => {
  assert.equal(parseDestructionAdminDetailView(new URLSearchParams()), "default");
  assert.equal(parseDestructionAdminDetailView(new URLSearchParams("tab=auction&mode=live")), "auction-live");
  assert.equal(parseDestructionAdminDetailView(new URLSearchParams("tab=auction")), null);
  assert.equal(parseDestructionAdminDetailView(new URLSearchParams("tab=auction&mode=live&next=/admin")), null);
});
