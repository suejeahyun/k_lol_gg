import { createHash } from "node:crypto";

const SESSION_TOKEN_HASH_DOMAIN = "klol-v2:session-token:v1";

export function hashSessionToken(token: string): Buffer {
  if (!token || token.length > 8_192) {
    throw new Error("Session token length is invalid.");
  }

  return createHash("sha256")
    .update(SESSION_TOKEN_HASH_DOMAIN, "utf8")
    .update("\0", "utf8")
    .update(token, "utf8")
    .digest();
}
