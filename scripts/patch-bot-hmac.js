const fs = require("fs");
const path = require("path");

const apiClientPath = path.join(process.cwd(), "src", "apiClient.js");
if (!fs.existsSync(apiClientPath)) {
  console.error("src/apiClient.js not found. Run this in /root/discord-operation-server");
  process.exit(1);
}

let src = fs.readFileSync(apiClientPath, "utf8");

if (!src.includes('require("crypto")') && !src.includes("require('crypto')")) {
  src = 'const crypto = require("crypto");\n' + src;
}

if (!src.includes("function createKlolSignature")) {
  src = src.replace(/(async function requestJson[\s\S]*?\{)/, `$1
  const payloadForSignature = typeof body === "undefined" ? "" : JSON.stringify(body ?? {});
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const secretForSignature = process.env.DISCORD_BOT_API_SECRET || process.env.DISCORD_API_SECRET || "";
  const signature = secretForSignature
    ? crypto.createHmac("sha256", secretForSignature).update(timestamp + "." + payloadForSignature, "utf8").digest("hex")
    : "";
`);
}

src = src.replace(/"x-klol-discord-secret"/g, '"x-discord-bot-secret"');
src = src.replace(/'x-klol-discord-secret'/g, "'x-discord-bot-secret'");

if (!src.includes("x-klol-timestamp")) {
  src = src.replace(/headers:\s*\{([\s\S]*?)\}/, (m) => {
    if (m.includes("x-klol-timestamp")) return m;
    return m.replace(/\{/, `{\n      "x-klol-timestamp": timestamp,\n      "x-klol-signature": signature,`);
  });
}

fs.writeFileSync(apiClientPath, src, "utf8");
console.log("patched src/apiClient.js with HMAC compatibility headers");