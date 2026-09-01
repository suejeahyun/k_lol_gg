import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("사용자 shell은 skip target, landmark, modal search, 모바일 5개 진입점을 제공한다", async () => {
  const shell = await readFile(new URL("../src/components/site-shell.tsx", import.meta.url), "utf8");
  const navigation = await readFile(
    new URL("../src/components/navigation/user-site-navigation.tsx", import.meta.url),
    "utf8",
  );

  assert.match(shell, /href="#main-content"/);
  assert.match(shell, /<main id="main-content">/);
  assert.match(shell, /<Suspense/);
  assert.match(navigation, /aria-haspopup="dialog"/);
  assert.match(navigation, /<dialog/);
  assert.match(navigation, /aria-current=/);
  assert.match(navigation, /className="mobile-nav"/);

  const mobileBlock = navigation.slice(
    navigation.indexOf("export function MobileUserNavigation"),
    navigation.indexOf("export function NavigationFallback"),
  );
  assert.equal((mobileBlock.match(/<Link/g) ?? []).length, 3);
  assert.equal((mobileBlock.match(/compact \/>/g) ?? []).length, 2);
});
test("V2 UI는 실제 운영 데이터가 없을 때 합성 샘플을 사용자 화면에 연결하지 않는다", async () => {
  const playerIndex = await readFile(new URL("../src/modules/players/index.ts", import.meta.url), "utf8");
  const playerPage = await readFile(
    new URL("../src/app/(public)/(registry)/players/page.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(playerIndex, /fixturePlayerRepository/);
  assert.match(playerPage, /샘플 플레이어를 만들어 보여주지 않습니다/);
});
