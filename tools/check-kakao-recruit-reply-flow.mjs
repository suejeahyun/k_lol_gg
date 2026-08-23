import { readFile } from "node:fs/promises";

const createRouteUrl = new URL(
  "../src/app/api/kakao/party-recruits/create/route.ts",
  import.meta.url,
);
const syncRouteUrl = new URL(
  "../src/app/api/kakao/party-recruits/sync/route.ts",
  import.meta.url,
);

const [createRoute, syncRoute] = await Promise.all([
  readFile(createRouteUrl, "utf8"),
  readFile(syncRouteUrl, "utf8"),
]);

const failures = [];

if (createRoute.includes("appendRecruitStatusSummary")) {
  failures.push("구인양식 응답에 구인현황 추가 함수가 남아 있습니다.");
}

if (!createRoute.includes("reply: buildCreateReply(")) {
  failures.push("구인양식 응답이 buildCreateReply를 직접 반환하지 않습니다.");
}

if (!syncRoute.includes("await appendRecruitStatusSummary(result.reply)")) {
  failures.push("구인 반영 성공 응답에서 구인현황 추가가 빠졌습니다.");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Kakao recruit reply flow checks passed.");
