import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = `
  import manifest from './src/app/manifest.ts';
  import { SERVICE_BRAND } from './src/lib/service-brand.ts';
  import { absoluteSiteUrl, createRouteMetadata, SEO_ROUTE_CONTRACTS } from './src/modules/seo/domain/site-seo.ts';
  import { playerReportStorageKey } from './src/components/riot/player-report-snapshot.ts';
  import { ADMIN_IMPORT_RECOVERY_STORAGE_KEY } from './src/modules/matches/infrastructure/admin-import-recovery.ts';
  import { createElement } from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { Search, Crown } from './src/components/theme/theme-icons.tsx';
  process.stdout.write(JSON.stringify({
    name: SERVICE_BRAND.name,
    manifest: manifest(),
    home: createRouteMetadata('/'),
    routes: SEO_ROUTE_CONTRACTS,
    playerUrl: absoluteSiteUrl('/players'),
    reportKey: playerReportStorageKey('same-player-id', 'same-name#KR1'),
    recoveryKey: ADMIN_IMPORT_RECOVERY_STORAGE_KEY,
    searchIcon: renderToStaticMarkup(createElement(Search, { 'aria-label': '검색', size: 20 })),
    crownIcon: renderToStaticMarkup(createElement(Crown)),
  }));
`;

function inspect(service, origin) {
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", source], {
    cwd: root,
    env: { ...process.env, NEXT_PUBLIC_SERVICE_ID: service, NEXT_PUBLIC_SITE_URL: origin },
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(child.status, 0, child.stderr || child.error?.message);
  return JSON.parse(child.stdout);
}

test("NEXUS publishes its own install name, metadata, links and browser data keys", () => {
  const nexus = inspect("nexus", "https://nexus.example");
  assert.equal(nexus.manifest.name, "NEXUS.GG");
  assert.equal(nexus.manifest.short_name, "NEXUS.GG");
  assert.equal(nexus.home.openGraph.siteName, "NEXUS.GG");
  assert.equal(nexus.manifest.theme_color, "#080e1d");
  assert.ok(nexus.manifest.icons.every(icon => icon.src.startsWith('/icons/nexus/')));
  assert.equal(nexus.manifest.icons.length, 3);
  assert.equal(nexus.manifest.shortcuts.length, 3);
  assert.ok(nexus.manifest.shortcuts.every(shortcut => shortcut.icons[0].src === '/icons/nexus/icon-192.png'));
  assert.equal(nexus.home.openGraph.images[0].url, '/images/nexus/mascot-board.png');
  assert.match(nexus.searchIcon, /<path|<circle/);
  assert.match(nexus.searchIcon, /role="img"/);
  assert.match(nexus.searchIcon, /aria-label="검색"/);
  assert.match(nexus.crownIcon, /aria-hidden="true"/);
  assert.doesNotMatch(nexus.searchIcon, /<image/);
  assert.equal(nexus.playerUrl, "https://nexus.example/players");
  assert.equal(nexus.reportKey, "nexus:riot-report:v1:same-player-id:same-name%23KR1");
  assert.equal(nexus.recoveryKey, "nexus-v2:admin-match-import:pending:v1");
  assert.doesNotMatch(JSON.stringify(nexus), /K-LOL|k-lol-gg\.vercel\.app/);
});

test("default K-LOL install, SEO and existing browser keys remain compatible", () => {
  const klol = inspect("", "");
  assert.equal(klol.manifest.name, "K-LOL.GG");
  assert.equal(klol.home.openGraph.siteName, "K-LOL.GG");
  assert.equal(klol.manifest.theme_color, "#89bdf2");
  assert.equal(klol.manifest.icons[0].src, '/icons/icon-192.png');
  assert.equal(klol.home.openGraph.images[0].url, '/og.png');
  assert.match(klol.searchIcon, /<image href="\/images\/theme\/v1\//);
  assert.equal(klol.playerUrl, "https://k-lol-gg.vercel.app/players");
  assert.equal(klol.reportKey, "klol:riot-report:v1:same-player-id:same-name%23KR1");
  assert.equal(klol.recoveryKey, "klol-v2:admin-match-import:pending:v1");
  assert.doesNotMatch(JSON.stringify(klol), /NEXUS/);
});
