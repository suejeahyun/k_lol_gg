const baseUrl = new URL(process.env.SEO_CHECK_BASE_URL || "http://localhost:3000");

const routes = [
  "/",
  "/players",
  "/rankings",
  "/matches",
  "/recruit",
  "/progress",
  "/progress/destruction",
  "/progress/event",
  "/highlights",
  "/images",
  "/kakao",
  "/recruit-helper",
  "/riot-api",
  "/coin-toss",
  "/random-team",
  "/privacy",
  "/terms",
];

const decodeHtml = (value) => value
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#x27;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");

const failures = [];

for (const route of routes) {
  const url = new URL(route, baseUrl);
  const response = await fetch(url, { redirect: "follow" });
  const html = await response.text();
  const title = decodeHtml(html.match(/<title>(.*?)<\/title>/s)?.[1]?.trim() || "");
  const description = decodeHtml(html.match(/<meta name="description" content="([^"]*)"/)?.[1]?.trim() || "");
  const canonical = decodeHtml(html.match(/<link rel="canonical" href="([^"]*)"/)?.[1]?.trim() || "");
  const robots = decodeHtml(html.match(/<meta name="robots" content="([^"]*)"/)?.[1]?.trim() || "");
  const expectedCanonical = new URL(route, baseUrl).href.replace(/\/$/, route === "/" ? "" : "/");

  if (!response.ok) failures.push(`${route}: HTTP ${response.status}`);
  if (!title) failures.push(`${route}: title 누락`);
  if (description.length < 30) failures.push(`${route}: description이 너무 짧거나 누락됨`);
  if (canonical !== expectedCanonical) {
    failures.push(`${route}: canonical 불일치 (${canonical || "누락"} != ${expectedCanonical})`);
  }
  if (/noindex/i.test(robots)) failures.push(`${route}: 공개 페이지에 noindex가 설정됨`);
}

if (failures.length > 0) {
  console.error("런타임 SEO 점검 실패:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`런타임 SEO 점검 완료: ${routes.length}개 공개 경로`);
