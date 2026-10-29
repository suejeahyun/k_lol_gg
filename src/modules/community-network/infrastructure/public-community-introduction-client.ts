import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { checkServerIdentity } from "node:tls";
import { parsePublicCommunityIntroductionDto, type PublicCommunityIntroductionDto } from "@/modules/operations/domain/community-introduction";
import { COMMUNITY_INTRODUCTION_MAX_BYTES, COMMUNITY_INTRODUCTION_PATH, COMMUNITY_INTRODUCTION_TIMEOUT_MS, introductionOrigin, selectIntroductionAddress, type IntroductionAddress } from "../domain/community-introduction-remote-policy";

export type HubCommunityIntroductionResult = { state: "ready"; data: PublicCommunityIntroductionDto } | { state: "unpublished" | "unavailable" | "unsupported" };
type IntroductionResponse = Readonly<{ status: number; contentType: string; contentEncoding: string; body: Buffer }>;
type Dependencies = Readonly<{
  resolve(hostname: string): Promise<readonly { address: string; family: number }[]>;
  request(origin: URL, address: IntroductionAddress, signal: AbortSignal): Promise<IntroductionResponse>;
  timeoutMs: number;
}>;

/** The TCP destination is the validated IP, while TLS identity and Host remain the registered hostname. */
export function requestPinnedCommunityIntroduction(origin: URL, address: IntroductionAddress, signal: AbortSignal): Promise<IntroductionResponse> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest({ protocol: "https:", hostname: address.address, family: address.family, port: 443,
      servername: origin.hostname, checkServerIdentity: (_hostname, certificate) => checkServerIdentity(origin.hostname, certificate), rejectUnauthorized: true,
      method: "GET", path: COMMUNITY_INTRODUCTION_PATH, agent: false, signal, maxHeaderSize: 8192,
      headers: { Host: origin.hostname, Accept: "application/json", "Accept-Encoding": "identity", "Cache-Control": "no-cache", Pragma: "no-cache" } }, (response) => {
      const status = response.statusCode ?? 0;
      const contentType = String(response.headers["content-type"] ?? ""), contentEncoding = String(response.headers["content-encoding"] ?? "identity");
      const finish = (body: Buffer) => resolve({ status, contentType, contentEncoding, body });
      if (status !== 200) { response.destroy(); finish(Buffer.alloc(0)); return; }
      if (Number(response.headers["content-length"]) > COMMUNITY_INTRODUCTION_MAX_BYTES) { response.destroy(); reject(new Error("INTRODUCTION_TOO_LARGE")); return; }
      const chunks: Buffer[] = []; let bytes = 0;
      response.on("data", (data: Buffer | string) => {
        const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
        bytes += chunk.length;
        if (bytes > COMMUNITY_INTRODUCTION_MAX_BYTES) { response.destroy(); reject(new Error("INTRODUCTION_TOO_LARGE")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => finish(Buffer.concat(chunks, bytes)));
      response.on("error", reject);
      response.on("aborted", () => reject(new Error("INTRODUCTION_RESPONSE_ABORTED")));
    });
    request.on("error", reject); request.end();
  });
}

/** No credentials, redirect following, persistent cache or user-selected path. */
export async function fetchPublicCommunityIntroduction(origin: string, overrides: Partial<Dependencies> = {}): Promise<HubCommunityIntroductionResult> {
  const target = introductionOrigin(origin);
  if (!target) return { state: "unsupported" };
  const dependencies: Dependencies = { resolve: (hostname) => lookup(hostname, { all: true, verbatim: true }), request: requestPinnedCommunityIntroduction, timeoutMs: COMMUNITY_INTRODUCTION_TIMEOUT_MS, ...overrides };
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error("INTRODUCTION_TIMEOUT")); }, dependencies.timeoutMs); });
  try {
    return await Promise.race([deadline, (async (): Promise<HubCommunityIntroductionResult> => {
      const address = selectIntroductionAddress(await dependencies.resolve(target.hostname));
      if (!address || controller.signal.aborted) return { state: "unavailable" };
      const response = await dependencies.request(target, address, controller.signal);
      if (response.status === 404) return { state: "unpublished" };
      if ((response.status >= 300 && response.status < 400) || response.status === 501) return { state: "unsupported" };
      if (response.status !== 200 || response.body.length > COMMUNITY_INTRODUCTION_MAX_BYTES) return { state: "unavailable" };
      if (!/^application\/json(?:\s*;|$)/iu.test(response.contentType) || !["", "identity"].includes(response.contentEncoding.toLowerCase())) return { state: "unsupported" };
      try {
        const raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.body));
        return { state: "ready", data: parsePublicCommunityIntroductionDto(raw, origin) };
      } catch { return { state: "unsupported" }; }
    })()]);
  } catch { return { state: "unavailable" }; }
  finally { if (timeout) clearTimeout(timeout); controller.abort(); }
}
