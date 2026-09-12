import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(root, ".private/KLOL_KAKAO_BOT_V1_STRICT_PRIVATE_MESSENGERBOT_R.js");
const source = await readFile(artifactPath, "utf8");

function privateSetting(name) {
  const escapedName = JSON.stringify(name).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = source.match(new RegExp(`DataBase\\.setDataBase\\(${escapedName},\\s*(\"(?:\\\\.|[^\"\\\\])*\")\\);`, "u"));
  if (!match) throw new Error(`Private MessengerBot setting is missing: ${name}`);
  return JSON.parse(match[1]);
}

const baseUrl = privateSetting("KLOL_V2_BASE_URL").replace(/\/+$/u, "");
const target = new URL(baseUrl);
if (target.protocol !== "https:" || target.hostname !== "k-lol-gg.vercel.app" || target.pathname !== "/") {
  throw new Error("Production V1 strict credential smoke is restricted to the reviewed K-LOL.GG origin.");
}
const identitySecret = privateSetting("KLOL_V4_KAKAO_IDENTITY_SECRET");
const signingSecret = privateSetting("KLOL_V4_KAKAO_WEBHOOK_SECRET_CURRENT");
const keyId = privateSetting("KLOL_V4_KAKAO_WEBHOOK_KEY_ID_CURRENT");
const hmac = (secret, value) => createHmac("sha256", secret).update(value).digest("hex");
for (const profileId of ["RECRUIT", "FEATURES"]) {
  const eventId = `event-live-smoke-${randomUUID()}`;
  const body = JSON.stringify({
    profileId,
    installationId: `install-${hmac(identitySecret, `installation-id\nKLOL_V4\n${profileId}`).slice(0, 32)}`,
    senderId: `sender-display-${hmac(identitySecret, `sender-id\nlive-smoke-${randomBytes(8).toString("hex")}`).slice(0, 32)}`,
    eventId,
    timestamp: Math.floor(Date.now() / 1_000),
    nonce: randomBytes(16).toString("hex"),
    text: "V4상태",
    protocol: "KLOL_KAKAO_V1_STRICT",
    responseFormat: "V1_SERVER_EXACT",
  });
  const digest = createHash("sha256").update(body).digest("hex");
  const material = ["KLOL_KAKAO_COMMAND_V4", keyId, digest].join("\n");
  const response = await fetch(`${baseUrl}/api/integrations/kakao/v4/commands`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      accept: "application/json",
      "x-klol-key-id": keyId,
      "x-klol-signature": `v4=${hmac(signingSecret, material)}`,
      "idempotency-key": eventId,
    },
    body,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Production V1 strict ${profileId} credential smoke failed: HTTP ${response.status}, code=${String(payload?.code ?? "UNKNOWN")}`);
  }
  if (payload?.version !== "KLOL_KAKAO_COMMAND_V4" || typeof payload?.reply !== "string" || !payload.reply.includes("command gateway: 정상")) {
    throw new Error(`Production V1 strict ${profileId} credential smoke returned an unexpected safe response.`);
  }
  console.log(`[kakao-v1-strict-live] ${profileId} HTTP ${response.status}, command gateway OK, credentials redacted`);
}
