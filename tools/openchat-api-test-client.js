#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/*
  PC ?뚯뒪?몄슜 肄섏넄 ?대씪?댁뼵?몄엯?덈떎.
  移댁뭅?ㅽ넚 PC 硫붿떆吏瑜??먮룞?쇰줈 ?쎈뒗 湲곕뒫? ?ы븿?섏? ?딆뒿?덈떎.

  ?ъ슜踰?
  1) npm run dev ?ㅽ뻾
  2) node tools/openchat-api-test-client.js http://localhost:3000
  3) 肄섏넄??"?꾩쟻 ?됰꽕???쒓렇" ?낅젰
*/

const readline = require("node:readline");

const baseUrl = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const endpoint = `${baseUrl}/api/kakao/openchat`;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "K-LOL 紐낅졊?? ",
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
  return data.reply || `?묐떟 ?뺤떇 ?ㅻ쪟: HTTP ${response.status}`;
}

console.log(`K-LOL.GG Openchat API ?뚯뒪???대씪?댁뼵??);
console.log(`Endpoint: ${endpoint}`);
console.log(`醫낅즺: exit`);
console.log("");

rl.prompt();

rl.on("line", async (line) => {
  const message = line.trim();

  if (!message) {
    rl.prompt();
    return;
  }

  if (["exit", "quit", "醫낅즺"].includes(message.toLowerCase())) {
    rl.close();
    return;
  }

  try {
    const reply = await request(message);
    console.log("\n--- 遊??묐떟 ---");
    console.log(reply);
    console.log("--------------\n");
  } catch (error) {
    console.error("?붿껌 ?ㅽ뙣:", error.message);
  }

  rl.prompt();
});



