#!/usr/bin/env node
/*
  PC 테스트용 콘솔 클라이언트입니다.
  카카오톡 PC 메시지를 자동으로 읽는 기능은 포함하지 않습니다.

  사용법:
  1) npm run dev 실행
  2) node tools/openchat-api-test-client.js http://localhost:3000
  3) 콘솔에 "전적 닉네임#태그" 입력
*/

const readline = require("node:readline");

const baseUrl = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const endpoint = `${baseUrl}/api/kakao/openchat`;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "K-LOL 명령어> ",
});

async function request(message) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });

  const data = await response.json().catch(() => ({}));
  return data.reply || `응답 형식 오류: HTTP ${response.status}`;
}

console.log(`K-LOL.GG Openchat API 테스트 클라이언트`);
console.log(`Endpoint: ${endpoint}`);
console.log(`종료: exit`);
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
    console.error("요청 실패:", error.message);
  }

  rl.prompt();
});
