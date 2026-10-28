import assert from "node:assert/strict";
import test from "node:test";
import { applyCommunityTemplate, communityAccentForeground, COMMUNITY_MODULE_CATALOG, COMMUNITY_TEMPLATES, createDefaultCommunitySiteConfig, getVisibleCommunityHomeSections, parseCommunityImageUrl, setCommunitySiteModule, validateCommunitySiteConfig } from "../src/modules/community-sites/domain/site-configuration";
import { communityModuleForKakaoCommand, communityModuleForNewAction, isCommunityModuleActionAllowed, isCommunityRecruitingNewWork } from "../src/modules/community-sites/domain/module-access";

test("three templates share valid modules while switching preserves identity, assets and module choices", () => {
  const original = { ...setCommunitySiteModule(createDefaultCommunitySiteConfig(), "recruiting", false), name: "테스트 클럽", logoUrl: "https://images.example.com/logo.png", primaryColor: "#ABCDEF" };
  const orders = new Set<string>();
  for (const template of COMMUNITY_TEMPLATES) {
    const changed = validateCommunitySiteConfig(applyCommunityTemplate(original, template.id));
    assert.equal(changed.name, original.name);
    assert.equal(changed.slug, original.slug);
    assert.equal(changed.logoUrl, original.logoUrl);
    assert.equal(changed.primaryColor, original.primaryColor);
    assert.deepEqual(changed.modules, original.modules);
    orders.add(changed.homeSections.join(","));
  }
  assert.equal(orders.size, 3);
});

test("disabling dependencies preserves home order and source object, with explicit reactivation", () => {
  const original = createDefaultCommunitySiteConfig();
  const stopped = setCommunitySiteModule(original, "matches", false);
  assert.equal(original.modules.matches, true);
  assert.equal(stopped.modules.teamBalance, false);
  assert.equal(stopped.modules.rankings, false);
  assert.deepEqual(stopped.homeSections, original.homeSections);
  assert.ok(!getVisibleCommunityHomeSections(stopped).some((section) => section.id === "matches" || section.id === "rankings"));
  const reopened = setCommunitySiteModule(stopped, "rankings", true);
  assert.equal(reopened.modules.matches, true);
  assert.equal(reopened.modules.rankings, true);
  assert.deepEqual(reopened.homeSections, original.homeSections);
  assert.throws(() => setCommunitySiteModule(original, "members", false), /INVALID_COMMUNITY_SITE_CONFIG/);
  assert.equal(validateCommunitySiteConfig(setCommunitySiteModule(original, "recruiting", false)).modules.recruiting, false);
});

test("server validation rejects injected modules, incomplete settings, broken dependencies and unsafe fields", () => {
  const config = createDefaultCommunitySiteConfig();
  const invalid = [
    { ...config, modules: { ...config.modules, federation: true } },
    { ...config, modules: { ...config.modules, members: false } },
    { ...config, modules: { ...config.modules, matches: false, rankings: true } },
    { ...config, modules: { ...config.modules, media: "true" } },
    { ...config, templateId: "custom-script" }, { ...config, name: "hello\u202Eworld" },
    { ...config, slug: "admin" }, { ...config, slug: "../../another" },
    { ...config, primaryColor: "red; background:url(x)" },
    { ...config, homeSections: ["recruiting"] }, { ...config, homeSections: ["introduction", "introduction"] },
    { ...config, homeSections: ["introduction", "federation"] }, { ...config, customHtml: "<script>" },
  ];
  for (const candidate of invalid) assert.throws(() => validateCommunitySiteConfig(candidate), /INVALID_COMMUNITY_SITE_CONFIG/);
  const incomplete: Record<string, unknown> = { ...config };
  delete incomplete.description;
  assert.throws(() => validateCommunitySiteConfig(incomplete), /INVALID_COMMUNITY_SITE_CONFIG/);
});

test("older saved module settings preserve explicit choices and leave newly available optional features off", () => {
  const stored = {
    ...createDefaultCommunitySiteConfig(),
    modules: { members: true, recruiting: false, matches: true, teamBalance: false, rankings: true },
  };
  const normalized = validateCommunitySiteConfig(stored);
  for (const [key, enabled] of Object.entries(stored.modules)) {
    assert.equal(normalized.modules[key as keyof typeof normalized.modules], enabled, `${key} must keep its stored choice`);
  }
  for (const definition of COMMUNITY_MODULE_CATALOG) {
    if (!Object.hasOwn(stored.modules, definition.id)) assert.equal(normalized.modules[definition.id], false, `${definition.id} must not opt an existing site in`);
  }
  assert.deepEqual(normalized.homeSections, stored.homeSections, "saved layout is preserved even for hidden blocks");
  assert.ok(!getVisibleCommunityHomeSections(normalized).some((section) => section.id === "competitions"));
  assert.deepEqual(validateCommunitySiteConfig(normalized), normalized, "normalization is stable across read/save/replay");
});

test("only optional omissions default off; missing required membership, invalid booleans and dependencies still fail", () => {
  const base = createDefaultCommunitySiteConfig();
  const minimal = validateCommunitySiteConfig({ ...base, modules: { members: true } });
  for (const definition of COMMUNITY_MODULE_CATALOG) assert.equal(minimal.modules[definition.id], definition.required);
  for (const modules of [{}, { members: false }, { members: undefined }, { members: true, media: undefined },
    { members: true, media: null }, { members: true, unknownFeature: false }, { members: true, rankings: true },
    { members: true, matches: false, teamBalance: true }]) {
    assert.throws(() => validateCommunitySiteConfig({ ...base, modules }), /INVALID_COMMUNITY_SITE_CONFIG/);
  }
  assert.equal(validateCommunitySiteConfig({ ...base, modules: { members: true, matches: true, rankings: true } }).modules.rankings, true);
});

test("image URLs cannot target local/numeric hosts or embed credentials/scripts", () => {
  for (const url of ["http://cdn.example.com/a.png", "javascript:alert(1)", "data:image/png;base64,x", "https://127.0.0.1/a", "https://2130706433/a", "https://[::1]/a", "https://localhost/a", "https://app.local/a", "https://user:password@cdn.example.com/a", "https://cdn.example.com:8443/a"]) {
    assert.throws(() => parseCommunityImageUrl(url), /INVALID_COMMUNITY_SITE_CONFIG/, url);
  }
  assert.equal(parseCommunityImageUrl(" https://cdn.example.com/a.png "), "https://cdn.example.com/a.png");
  assert.equal(parseCommunityImageUrl("  "), null);
  assert.equal(communityAccentForeground("#FFFFFF"), "#101828");
  assert.equal(communityAccentForeground("#000000"), "#FFFFFF");
  // Browser axe caught white (4.23:1) and tinted dark text both failing here.
  assert.equal(communityAccentForeground("#8B5CF6"), "#000000");
});

test("closed modules deny new work while retaining reads, cancellation, result completion and existing record edits", () => {
  let stopped = createDefaultCommunitySiteConfig();
  for (const id of ["recruiting", "matches", "competitions", "media"] as const) stopped = setCommunitySiteModule(stopped, id, false);
  const blocked = [
    ["POST", "/api/recruits"], ["POST", "/api/applications/season"], ["POST", "/api/me/match-submissions"],
    ["POST", "/api/admin/matches"], ["POST", "/api/admin/matches/import"],
    ["POST", "/api/admin/competitions/events"], ["POST", "/api/admin/competitions/destruction"],
    ["PUT", "/api/competitions/events/event-id/application"], ["PUT", "/api/competitions/destruction/tournament-id/application"],
    ["POST", "/api/admin/images"], ["POST", "/api/admin/highlights"], ["POST", "/api/team-tools/drafts"],
    ["POST", "/api/team-tools/drafts/draft-id/recommendations"],
  ];
  for (const [method, path] of blocked) assert.equal(isCommunityModuleActionAllowed(stopped, path, method), false, `${method} ${path}`);
  const allowed = [
    ["GET", "/api/recruits"], ["DELETE", "/api/applications/season"], ["POST", "/api/me/match-submissions/existing/cancel"],
    ["POST", "/api/admin/matches/submissions/existing/approve"], ["PATCH", "/api/admin/matches/existing"],
    ["PUT", "/api/admin/matches/import"], ["DELETE", "/api/competitions/events/existing/application"],
    ["PATCH", "/api/admin/competitions/events/existing"], ["PATCH", "/api/admin/images/existing"],
    ["POST", "/api/team-tools/drafts/existing/save"], ["GET", "/api/team-tools/drafts/existing"],
  ];
  for (const [method, path] of allowed) assert.equal(isCommunityModuleActionAllowed(stopped, path, method), true, `${method} ${path}`);
  assert.equal(communityModuleForNewAction("/api/recruits/", "post"), "recruiting");
  assert.equal(communityModuleForNewAction("/api/%72ecruits", "POST"), "recruiting");
});

test("bot guards distinguish new participants/upserts from status, removal and finishing", () => {
  for (const command of ["CREATE_PARTY", "SYNC_PARTY", "SYNC_SCRIM", "JOIN_SCRIM", "PARTY_MEMBER_ADD", "ADD_SCRIM_PARTICIPANT"]) assert.equal(isCommunityRecruitingNewWork(command), true);
  for (const command of ["GET_PARTY_STATUS", "PARTY_MEMBER_REMOVE", "REMOVE_SCRIM_PARTICIPANT", "FINISH_PARTY", "COMPLETE_SCRIM", "CANCEL_SCRIM"]) assert.equal(isCommunityRecruitingNewWork(command), false);
  assert.equal(communityModuleForKakaoCommand("INHOUSE_CREATE"), "recruiting");
  assert.equal(communityModuleForKakaoCommand("INHOUSE_SNAPSHOT"), "recruiting");
  assert.equal(communityModuleForKakaoCommand("INHOUSE_FINISH"), null);
  assert.equal(communityModuleForKakaoCommand("OPERATIONS_INHOUSE_RESULT"), "matches");
});
