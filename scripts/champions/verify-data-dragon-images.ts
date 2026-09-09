import {
  DATA_DRAGON_CHAMPIONS,
  DATA_DRAGON_VERSION,
} from "../../src/modules/champions/domain/data-dragon-catalog";
import {
  officialChampionImageUrl,
  resolveChampionImageUrl,
} from "../../src/modules/champions/domain/champion-image";
import sharp from "sharp";

type Verification = Readonly<{
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

const results = new Array<Verification>(DATA_DRAGON_CHAMPIONS.length);
let cursor = 0;

async function worker(): Promise<void> {
  while (cursor < DATA_DRAGON_CHAMPIONS.length) {
    const index = cursor;
    cursor += 1;
    const champion = DATA_DRAGON_CHAMPIONS[index]!;
    const url = officialChampionImageUrl(champion.id);
    if (!url) throw new Error("OFFICIAL_CHAMPION_IMAGE_URL_MISSING:" + champion.id);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { "user-agent": "KLOL.GG champion image verification" },
        signal: AbortSignal.timeout(15_000),
      });
      const contentType = response.headers.get("content-type");
      const image = Buffer.from(await response.arrayBuffer());
      const metadata = response.status === 200 ? await sharp(image).metadata() : null;
      const isDecodedPng =
        contentType?.toLowerCase().startsWith("image/png") === true &&
        metadata?.format === "png" &&
        typeof metadata.width === "number" &&
        metadata.width > 0 &&
        typeof metadata.height === "number" &&
        metadata.height > 0;
      results[index] = {
        id: champion.id,
        name: champion.name,
        url,
        status: response.status,
        contentType,
        format: metadata?.format ?? null,
        width: metadata?.width ?? null,
        height: metadata?.height ?? null,
        ok: response.status === 200 && isDecodedPng,
        error:
          response.status === 200 && !isDecodedPng
            ? "RESPONSE_IS_NOT_A_DECODABLE_PNG"
            : null,
      };
    } catch (error) {
      results[index] = {
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
  fixtureRows: results.length,
  http200Rows: results.filter((result) => result.status === 200).length,
  decodedPngRows: results.filter((result) => result.ok).length,
  intentionalFallbackRows: intentionalFallback ? 1 : 0,
  failedRows: failures.length,
  brokenImageCount: failures.length,
  failures,
};
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
if (!intentionalFallback || failures.length > 0) process.exitCode = 1;
