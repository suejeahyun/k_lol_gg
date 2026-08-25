import { readFile } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const publicCode = String(process.argv[2] || "").trim().toUpperCase();
const imageDir = process.argv[3];
const start = Number(process.argv[4] || 1);
const count = Number(process.argv[5] || 1);
const sender = String(process.argv[6] || "Codex 자동화 테스트").trim();
const secret = process.env.KAKAO_RECRUIT_SECRET;

if (!publicCode || !imageDir || !sender || !secret || !Number.isInteger(start) || !Number.isInteger(count) || count < 1) {
  throw new Error("사용법: node tools/test-kakao-image-receive.mjs <publicCode|ACTIVE> <imageDir> [start] [count] [sender]");
}

for (let offset = 0; offset < count; offset += 1) {
  const number = start + offset;
  const label = String(number).padStart(2, "0");
  const filePath = path.join(imageDir, `klol-test-${label}.png`);
  const base64Image = (await readFile(filePath)).toString("base64");
  const endpoint = new URL("https://k-lol-gg.vercel.app/api/kakao/image-receive");
  endpoint.searchParams.set("testEvent", `codex-${publicCode}-${label}-${Date.now()}`);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-kakao-recruit-secret": secret },
    body: JSON.stringify({
      roomName: "K 롤방 K롤방 공유& 문의 &건의 오픈톡방",
      sender,
      ...(publicCode === "ACTIVE" ? {} : { publicCode }),
      mimeType: "image/png",
      sourceEventKey: `codex-${publicCode}-${label}`,
      base64Image,
    }),
  });
  const responseText = await response.text();
  let result = {};
  try { result = JSON.parse(responseText); } catch { result = {}; }
  console.log(JSON.stringify({ number, status: response.status, contentType: response.headers.get("content-type"), reply: result.reply || result.message || null, responseText: responseText.slice(0, 500) }));
  if (!response.ok) process.exitCode = 1;
}
