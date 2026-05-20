import { writeFileSync } from "node:fs";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || "https://k-lol-gg.vercel.app";
const recruitSecret = process.env.KAKAO_RECRUIT_SECRET;
const openchatSecret = process.env.KAKAO_OPENCHAT_SECRET;

const checks = [
  {
    name: "GET /api/rankings",
    url: `${baseUrl}/api/rankings`,
  },
  {
    name: "GET /api/stats/top",
    url: `${baseUrl}/api/stats/top`,
  },
  {
    name: "GET /api/kakao/party-recruits/status",
    url: `${baseUrl}/api/kakao/party-recruits/status`,
    headers: recruitSecret ? { "x-kakao-recruit-secret": recruitSecret, Authorization: `Bearer ${recruitSecret}` } : {},
  },
  {
    name: "POST /api/kakao/openchat 도움말",
    url: `${baseUrl}/api/kakao/openchat`,
    method: "POST",
    headers: openchatSecret
      ? { "Content-Type": "application/json; charset=utf-8", "x-kakao-openchat-secret": openchatSecret, Authorization: `Bearer ${openchatSecret}` }
      : { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ message: "도움말", roomName: "LOL - K" }),
  },
];

const results = [];

for (const check of checks) {
  const startedAt = Date.now();
  try {
    const res = await fetch(check.url, {
      method: check.method || "GET",
      headers: check.headers || {},
      body: check.body,
    });
    const text = await res.text();
    results.push({
      name: check.name,
      ok: res.ok,
      status: res.status,
      elapsedMs: Date.now() - startedAt,
      bodyPreview: text.slice(0, 1200),
    });
  } catch (error) {
    results.push({
      name: check.name,
      ok: false,
      status: null,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const failed = results.filter((item) => !item.ok);
const output = JSON.stringify({ baseUrl, checkedAt: new Date().toISOString(), results }, null, 2);
const filename = `KLOL_DEPLOY_SMOKE_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(filename, output, "utf8");
console.log(output);
console.log(`로그 파일: ${filename}`);

if (failed.length > 0) process.exit(1);
