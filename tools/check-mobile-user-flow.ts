import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import {
  createMobileAppBootScript,
  isMobileStandalonePath,
  toMobileAppPath,
} from "../src/lib/navigation/mobile-app-route";
import { safeLocalNextPath } from "../src/lib/navigation/safe-next";
import { getDisplayActiveMemberCount } from "../src/lib/kakao/party-recruit";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const standaloneEntryPaths = [
  "/start",
  "/account",
  "/discipline/evidence",
  "/matches/submit",
  "/players/balance",
  "/balance",
  "/participation",
  "/admin/login",
  "/admin/security",
  "/admin/discipline/new",
  "/admin/matches/submissions",
] as const;

for (const path of standaloneEntryPaths) {
  assert.equal(isMobileStandalonePath(path), true, `${path} must remain standalone on mobile`);
  assert.equal(toMobileAppPath(path), path, `${path} must not collapse into the mobile home`);
}
assert.equal(
  toMobileAppPath("/matches/submit", "code=MRA7225B15AE"),
  "/matches/submit?code=MRA7225B15AE",
);
assert.equal(
  toMobileAppPath("/discipline/evidence", "code=WR0123456789"),
  "/discipline/evidence?code=WR0123456789",
);
assert.equal(toMobileAppPath("/progress/event/17"), "/app/progress/event/17");
assert.equal(toMobileAppPath("/participation/event/17"), "/app/progress/event/17");
assert.equal(toMobileAppPath("/players/balance"), "/players/balance");
assert.equal(toMobileAppPath("/balance"), "/balance");
assert.equal(toMobileAppPath("/participation"), "/participation");
assert.equal(
  toMobileAppPath("/progress/destruction/5/mvp-vote"),
  "/app/progress/destruction/5/mvp-vote",
);
assert.equal(toMobileAppPath("/matches/42", "view=games"), "/app/matches/42?view=games");
assert.equal(
  getDisplayActiveMemberCount(
    [
      { name: "참가자", position: null, slotNo: 1, isSubstitute: false },
      { name: "예비", position: null, slotNo: 2, isSubstitute: true },
      { name: "", position: null, slotNo: 3, isSubstitute: false },
    ],
    5,
  ),
  1,
);

assert.equal(safeLocalNextPath("https://evil.example/steal", { fallback: "/app" }), "/app");
assert.equal(safeLocalNextPath("//evil.example/steal", { fallback: "/app" }), "/app");
assert.equal(safeLocalNextPath("/api/admin/users", { fallback: "/app" }), "/app");
assert.equal(safeLocalNextPath("/app/login?next=/admin", { fallback: "/app" }), "/app");
assert.equal(safeLocalNextPath("/admin/login?next=/admin", { fallback: "/app" }), "/app");
assert.equal(safeLocalNextPath(["/matches/42", "//evil.example"], { fallback: "/app" }), "/matches/42");
assert.equal(
  safeLocalNextPath("/matches/submit?code=MRA7225B15AE", { fallback: "/app" }),
  "/matches/submit?code=MRA7225B15AE",
);
assert.equal(
  safeLocalNextPath("/admin/discipline/new?source=kakao", { fallback: "/admin/matches" }),
  "/admin/discipline/new?source=kakao",
);

const bootScript = createMobileAppBootScript();
assert.match(bootScript, /matches\/submit/);
assert.match(bootScript, /discipline\/evidence/);

function runMobileBoot(pathname: string, search = "") {
  let redirectedTo = "";
  runInNewContext(bootScript, {
    window: {
      location: {
        pathname,
        search,
        replace: (target: string) => {
          redirectedTo = target;
        },
      },
      matchMedia: () => ({ matches: true }),
      sessionStorage: { getItem: () => null },
    },
  });
  return redirectedTo;
}

assert.equal(runMobileBoot("/matches/submit", "?code=MRA7225B15AE"), "");
assert.equal(runMobileBoot("/discipline/evidence", "?code=WR0123456789"), "");
for (const path of standaloneEntryPaths) {
  assert.equal(runMobileBoot(path, "?source=mobile-test"), "", `${path} must bypass mobile redirect`);
}
assert.equal(runMobileBoot("/progress/event/17", "?from=notice"), "/app/progress/event/17?from=notice");
assert.equal(runMobileBoot("/progress/destruction/5/mvp-vote"), "/app/progress/destruction/5/mvp-vote");

const appLoginPage = read("src/app/app/login/page.tsx");
assert.match(appLoginPage, /getCurrentUser/);
assert.doesNotMatch(appLoginPage, /cookieStore\.get\("user_token"\)/);

const adminLoginPage = read("src/app/(admin)/admin/login/page.tsx");
assert.match(adminLoginPage, /safeLocalNextPath/);
assert.match(adminLoginPage, /next:\s*nextPath/);
assert.match(adminLoginPage, /router\.push\(nextPath\)/);

const adminSecurityPage = read("src/app/(admin)/admin/security/page.tsx");
assert.match(adminSecurityPage, /safeLocalNextPath/);
assert.match(adminSecurityPage, /nextPath=\{nextPath\}/);

const adminSecurityClient = read("src/app/(admin)/admin/security/_components/AdminSecurityTwoFactorClient.tsx");
assert.match(adminSecurityClient, /new URLSearchParams\(\{ security, next: nextPath \}\)/);

const proxy = read("src/proxy.ts");
assert.match(proxy, /loginUrl\.searchParams\.set\("next", requestedPath\)/);
assert.match(proxy, /securityUrl\.searchParams\.set\("next", requestedPath\)/);

const manifest = JSON.parse(read("public/manifest.json")) as {
  shortcuts?: Array<{ url?: string }>;
};
const shortcutUrls = new Set(manifest.shortcuts?.map((shortcut) => shortcut.url));
assert.equal(shortcutUrls.has("/start"), true);
assert.equal(shortcutUrls.has("/discipline/evidence"), true);
assert.equal(shortcutUrls.has("/matches/submit"), true);

const appEventPage = read("src/app/app/progress/event/[eventId]/page.tsx");
assert.match(appEventPage, /EventParticipationClient/);
assert.match(appEventPage, /event\.status === "RECRUITING"/);

const appRecruitsPage = read("src/app/app/recruits/page.tsx");
assert.match(appRecruitsPage, /return "IN_PROGRESS"/);
assert.match(appRecruitsPage, /getDisplayActiveMemberCount/);

const inhouseSubmit = read("src/app/(user)/matches/submit/InhouseResultSubmitClient.tsx");
assert.match(inhouseSubmit, /SelectedImageGrid/);
assert.match(inhouseSubmit, /history\.replaceState/);
assert.match(inhouseSubmit, /selectedFiles\.slice\(index\)/);

const disciplineSubmit = read("src/app/(user)/discipline/evidence/DisciplineEvidenceSubmitClient.tsx");
assert.match(disciplineSubmit, /SelectedImageGrid/);
assert.match(disciplineSubmit, /taskPicker/);
assert.match(disciplineSubmit, /searchParams\.delete\("code"\)/);
assert.match(disciplineSubmit, /history\.replaceState/);
assert.match(disciplineSubmit, /files\.slice\(index\)/);

const mobileMePage = read("src/app/app/me/page.tsx");
assert.match(mobileMePage, /caption="경고 차감 사진 제출" captionHref="\/discipline\/evidence"/);
assert.doesNotMatch(mobileMePage, /discipline\/evidence\?code=/);

console.log("mobile user flow checks passed");
