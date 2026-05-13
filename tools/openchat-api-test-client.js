#!/usr/bin/env node
/* eslint-disable no-console */

const readline = require("node:readline");

const baseUrl = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const endpoint = `${baseUrl}/api/kakao/openchat`;
const secret = process.env.KAKAO_OPENCHAT_SECRET || "";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "K-LOL 명령> ",
});

async function request(message) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (secret) {
    headers["x-kakao-openchat-secret"] = secret;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ message }),
  });

  const data = await response.json().catch(() => ({}));
  return data.reply || `응답 형식 오류: HTTP ${response.status}`;
}

console.log("K-LOL.GG OpenChat API 테스트 클라이언트");
console.log(`Endpoint: ${endpoint}`);
console.log("종료: exit 또는 quit");
console.log("");

rl.prompt();

rl.on("line", async (line) => {
  const message = line.trim();

  if (!message) {
    rl.prompt();
    return;
  }

  if (["exit", "quit", "종료"].includes(message.toLowerCase())) {
    rl.close();
    return;
  }

  try {
    const reply = await request(message);
    console.log("\n--- 봇 응답 ---");
    console.log(reply);
    console.log("--------------\n");
  } catch (error) {
    console.error("요청 실패:", error instanceof Error ? error.message : error);
  }

  rl.prompt();
});
