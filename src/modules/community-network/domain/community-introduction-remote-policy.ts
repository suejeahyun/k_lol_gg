import { isIP } from "node:net";

export const COMMUNITY_INTRODUCTION_PATH = "/api/community-introduction";
export const COMMUNITY_INTRODUCTION_MAX_BYTES = 32 * 1024;
export const COMMUNITY_INTRODUCTION_TIMEOUT_MS = 3000;

/** Only a canonical HTTPS DNS origin can supply a public introduction. */
export function introductionOrigin(value: string): URL | null {
  try {
    const url = new URL(value);
    const host = url.hostname;
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash || value !== url.origin
      || isIP(host) !== 0 || host.includes(":") || host.length > 253 || !host.includes(".")
      || !host.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))
      || /(?:^|\.)(?:localhost|local|internal|invalid|test)$/u.test(host)) return null;
    return url;
  } catch { return null; }
}

/** Conservative global-unicast allow rules; no local, reserved or embedded tunnel destinations. */
export function isPublicIntroductionAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113) || address === "168.63.129.16");
  }
  if (family !== 6 || address.includes(".") || address.includes("%")) return false;
  const [left, right] = address.toLowerCase().split("::");
  const prefix = left ? left.split(":") : [], suffix = right ? right.split(":") : [];
  const words = (right === undefined ? prefix : [...prefix, ...Array(8 - prefix.length - suffix.length).fill("0"), ...suffix]).map((word) => parseInt(word, 16));
  // Reject mapped/translated IPv4, NAT64, ULA, link-local, multicast, unspecified and loopback.
  if (words.length !== 8 || words[0] < 0x2000 || words[0] > 0x3fff) return false;
  if ((words[0] === 0x2001 && (words[1] < 0x0200 || words[1] === 0x0db8))
    || words[0] === 0x2002 || words[0] === 0x3fff) return false;
  // ISATAP can tunnel an embedded private IPv4 destination through a global-looking prefix.
  if ((words[4] === 0 || words[4] === 0x0200) && words[5] === 0x5efe) return false;
  return true;
}

export type IntroductionAddress = Readonly<{ address: string; family: 4 | 6 }>;
export function selectIntroductionAddress(records: readonly { address: string; family: number }[]): IntroductionAddress | null {
  if (records.length === 0 || records.length > 32 || records.some((entry) => isIP(entry.address) !== entry.family || !isPublicIntroductionAddress(entry.address))) return null;
  const selected = records.find((entry) => entry.family === 4) ?? records[0];
  return { address: selected.address, family: selected.family as 4 | 6 };
}
