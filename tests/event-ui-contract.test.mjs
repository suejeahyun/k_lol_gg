import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("public competition pages expose list/detail/application states without administrator controls", () => {
  const list = source("../src/app/(public)/(competitions)/competitions/competition-list-views.tsx");
  const eventListPage = source("../src/app/(public)/(competitions)/competitions/events/page.tsx");
  const destructionListPage = source("../src/app/(public)/(competitions)/competitions/destruction/page.tsx");
  const detail = source("../src/app/(public)/(competitions)/competitions/events/[eventId]/page.tsx");
  const application = source("../src/app/(public)/(competitions)/competitions/events/[eventId]/event-application-actions.tsx");
  for (const token of ["parseEventListQuery", "parseDestructionListQuery", 'action="/competitions/events"', 'action="/competitions/destruction"', 'role={error ? "alert" : "status"}']) assert.equal(list.includes(token), true, token);
  assert.match(eventListPage, /canonical: "\/competitions\/events"/);
  assert.match(destructionListPage, /canonical: "\/competitions\/destruction"/);
  for (const token of ["notFound()", "applicationsOpen", "EventApplicationActions", "팀 편성", "대진과 결과", "event.gallery", "ResilientMediaImage", "parseEventDetailAction"]) assert.equal(detail.includes(token), true, token);
  for (const token of ["playerName", "teamAName", "teamBName", "winnerTeamName"]) assert.equal(detail.includes(token), true, token);
  for (const token of ["If-Match", "Idempotency-Key", 'aria-live="polite"', 'method: "PUT"', '"DELETE"']) assert.equal(application.includes(token), true, token);
  for (const token of ["focusOnMount", "scrollIntoView", 'id="event-application"']) assert.equal(application.includes(token), true, token);
  assert.equal(`${list}${detail}${application}`.includes("ownerUserAccountId"), false);
  assert.equal(`${list}${detail}${application}`.includes("START_RECRUITMENT"), false);
});

test("administrator event pages connect every lifecycle operation to protected canonical APIs", () => {
  const list = source("../src/app/(admin)/admin/progress/event/page.tsx");
  const detail = source("../src/app/(admin)/admin/progress/event/[eventId]/page.tsx");
  const actions = source("../src/app/(admin)/admin/progress/event/[eventId]/event-admin-actions.tsx");
  const create = source("../src/app/(admin)/admin/progress/event/new/event-create-form.tsx");
  assert.equal(list.includes("requirePageRole"), true);
  for (const token of ["PLANNED", "RECRUITING", "TEAM_BUILDING", "IN_PROGRESS", "COMPLETED", "CANCELLED", "EventAdminActions"]) assert.equal(detail.includes(token), true, token);
  for (const token of ["START_RECRUITMENT", "CLOSE_RECRUITMENT", "ADD_PARTICIPANT", "IMPORT_PARTICIPANTS", "SET_MEDIA_GALLERY", "BUILD_TEAMS", "GENERATE_BRACKET", "RECORD_RESULT", "CORRECT_RESULT", "COMPLETE_EVENT", "CANCEL_EVENT", "RESTORE_EVENT", "If-Match", "Idempotency-Key"]) assert.equal(actions.includes(token), true, token);
  for (const token of ["BoundedPicker", "playerOptions", "playerLabels", "winnerTeamId", "mvpParticipantId"]) assert.equal(actions.includes(token), true, token);
  assert.doesNotMatch(`${detail}${actions}`, /플레이어 UUID|MVP 참가자 ID/u);
  for (const token of ["crypto.randomUUID", "bracketBestOf", "recruitmentOpensAt", 'If-Match":']) assert.equal(create.includes(token), true, token);
});

test("legacy event routes reuse the common no-store same-origin redirect boundary", () => {
  const redirect = source("../src/app/(public)/(legacy)/participation/event/[eventId]/route.ts");
  assert.equal(redirect.includes("buildLegacyCanonicalIdDestination"), true);
  assert.equal(redirect.includes("legacyRedirectResponse"), true);
  assert.equal(redirect.includes('{ action: "apply" }'), true);
});
