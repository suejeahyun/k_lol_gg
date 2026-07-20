import { randomBytes } from "node:crypto";

export function createTemporaryPassword() {
  return `KLOL-${randomBytes(12).toString("base64url")}`;
}
