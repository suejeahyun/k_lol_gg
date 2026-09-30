import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
export const USAGE_COOKIE = "klol_usage";
const signature = (id: string, secret: string) => createHmac("sha256", secret).update(`usage-v1:${id}`).digest("hex");
export function readUsageVisitor(value: string | undefined, secret: string): string | null {
  if (!value || !/^[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(value)) return null;
  const [id, mac] = value.split(".");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) return null;
  return timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(signature(id, secret), "hex")) ? id : null;
}
export function createUsageVisitor(secret: string) {
  const id = randomUUID();
  return { id, value: `${id}.${signature(id, secret)}` };
}
