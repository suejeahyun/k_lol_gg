import { createHash } from "node:crypto";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function normalizeSourcePart(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u3000]/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function getKstDateKey(now = new Date()) {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function createOperationFormSourceHash(input: {
  type: string;
  rawText: string;
  roomName?: string | null;
  sender?: string | null;
  receivedAt?: Date;
}) {
  const source = [
    "kakao-operation-form-v1",
    getKstDateKey(input.receivedAt),
    normalizeSourcePart(input.type).toLowerCase(),
    normalizeSourcePart(input.roomName),
    normalizeSourcePart(input.sender),
    normalizeSourcePart(input.rawText),
  ].join("\n---\n");

  return createHash("sha256").update(source, "utf8").digest("hex");
}
