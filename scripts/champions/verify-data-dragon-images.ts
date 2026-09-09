import {
  DATA_DRAGON_CHAMPIONS,
  DATA_DRAGON_VERSION,
} from "../../src/modules/champions/domain/data-dragon-catalog";
import {
  officialChampionImageUrl,
  officialChampionSplashUrl,
  resolveChampionImageUrl,
} from "../../src/modules/champions/domain/champion-image";
import sharp from "sharp";

type Verification = Readonly<{
  kind: "icon" | "splash";
  id: string;
  name: string;
  url: string;
  status: number | null;
  contentType: string | null;
  format: string | null;
  width: number | null;
  height: number | null;
  ok: boolean;
  error: string | null;
}>;

const assets = DATA_DRAGON_CHAMPIONS.flatMap((champion) => {
  const iconUrl = officialChampionImageUrl(champion.id);
  const splashUrl = officialChampionSplashUrl(champion.id);
  if (!iconUrl || !splashUrl) throw new Error("OFFICIAL_CHAMPION_ASSET_URL_MISSING:" + champion.id);
  return [
    { champion, kind: "icon" as const, url: iconUrl },
    { champion, kind: "splash" as const, url: splashUrl },
  ];
});
const results = new Array<Verification>(assets.length);
let cursor = 0;

async function worker(): Promise<void> {
  while (cursor < assets.length) {
    const index = cursor;
    cursor += 1;
    const { champion, kind, url } = assets[index]!;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { "user-agent": "KLOL.GG champion image verification" },
        signal: AbortSignal.timeout(15_000),
      });
      const contentType = response.headers.get("content-type");
      const image = Buffer.from(await response.arrayBuffer());
      const metadata = response.status === 200 ? await sharp(image).metadata() : null;
      const decodedWidth = metadata?.width ?? null;
      const decodedHeight = metadata?.height ?? null;
      const isExpectedImage =
        (kind === "icon"
          ? contentType?.toLowerCase().startsWith("image/png") === true && metadata?.format === "png"
          : contentType?.toLowerCase().startsWith("image/jpeg") === true && metadata?.format === "jpeg") &&
        typeof decodedWidth === "number" &&
        decodedWidth >= (kind === "icon" ? 120 : 1_000) &&
        typeof decodedHeight === "number" &&
        decodedHeight >= (kind === "icon" ? 120 : 500);
      results[index] = {
        kind,
        id: champion.id,
        name: champion.name,
        url,
        status: response.status,
        contentType,
        format: metadata?.format ?? null,
        width: decodedWidth,
        height: decodedHeight,
        ok: response.status === 200 && isExpectedImage,
        error:
          response.status === 200 && !isExpectedImage
            ? "RESPONSE_IS_NOT_EXPECTED_DECODABLE_IMAGE"
            : null,
      };
    } catch (error) {
      results[index] = {
        kind,
        id: champion.id,
        name: champion.name,
        url,
        status: null,
        contentType: null,
        format: null,
        width: null,
        height: null,
        ok: false,
        error: error instanceof Error ? error.message : "UNKNOWN_FETCH_ERROR",
      };
    }
  }
}

await Promise.all(Array.from({ length: 12 }, () => worker()));

const failures = results.filter((result) => !result.ok);
const intentionalFallback = resolveChampionImageUrl(
  "https://example.invalid/not-allowed.png",
  "unknown-champion",
  "알 수 없는 챔피언",
) === null;
const summary = {
  dataDragonVersion: DATA_DRAGON_VERSION,
  fixtureRows: DATA_DRAGON_CHAMPIONS.length,
  assetRows: results.length,
  http200Rows: results.filter((result) => result.status === 200).length,
  iconHttp200Rows: results.filter((result) => result.kind === "icon" && result.status === 200).length,
  decodedPngRows: results.filter((result) => result.kind === "icon" && result.ok).length,
  splashHttp200Rows: results.filter((result) => result.kind === "splash" && result.status === 200).length,
  decodedSplashRows: results.filter((result) => result.kind === "splash" && result.ok).length,
  minimumSplashWidth: Math.min(...results.filter((result) => result.kind === "splash").map((result) => result.width ?? 0)),
  minimumSplashHeight: Math.min(...results.filter((result) => result.kind === "splash").map((result) => result.height ?? 0)),
  intentionalFallbackRows: intentionalFallback ? 1 : 0,
  failedRows: failures.length,
  brokenImageCount: failures.length,
  failures,
};
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
if (!intentionalFallback || failures.length > 0) process.exitCode = 1;
