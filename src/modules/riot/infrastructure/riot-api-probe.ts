/** Fixed platform status request only; never takes a player identifier or a caller URL. */
export async function probeRiotApiKey(apiKey: string, request: typeof fetch = fetch) {
  try {
    const response = await request("https://kr.api.riotgames.com/lol/status/v4/platform-data", {
      method: "GET", headers: { "X-Riot-Token": apiKey, Accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000),
    });
    await response.body?.cancel();
    const status = response.status;
    return { ok: status === 200, providerStatus: status,
      code: status === 200 ? "STATUS_ENDPOINT_ACCEPTED" : status === 401 || status === 403 ? "UPSTREAM_UNAUTHORIZED"
        : status === 429 ? "UPSTREAM_RATE_LIMITED" : "UPSTREAM_UNAVAILABLE" } as const;
  } catch {
    return { ok: false, providerStatus: null, code: "UPSTREAM_UNAVAILABLE" } as const;
  }
}
