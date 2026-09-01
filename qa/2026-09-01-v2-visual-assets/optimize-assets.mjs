import { createHash } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import sharp from "sharp";

const repoRoot = resolve(process.cwd());
const sourceRoot = resolve(repoRoot, "..", "output", "v2-visual-assets-20260901");
const assetRoot = resolve(repoRoot, "public", "images");
const championRoot = resolve(assetRoot, "champions");
const brandRoot = resolve(assetRoot, "brand");
const qaRoot = resolve(repoRoot, "qa", "2026-09-01-v2-visual-assets");

const cards = [
  {
    slug: "lux",
    nameKo: "럭스",
    source: "lux-source.png",
    alt: "햇살 가득한 구름 정원에서 빛의 지팡이를 든 럭스 비공식 AI 팬아트",
  },
  {
    slug: "janna",
    nameKo: "잔나",
    source: "janna-source.png",
    alt: "맑은 하늘과 바람 리본 사이에서 지팡이를 든 잔나 비공식 AI 팬아트",
  },
  {
    slug: "seraphine",
    nameKo: "세라핀",
    source: "seraphine-source.png",
    alt: "파스텔 구름 무대에서 수정 마이크를 든 세라핀 비공식 AI 팬아트",
  },
  {
    slug: "lulu",
    nameKo: "룰루",
    source: "lulu-source.png",
    alt: "하늘빛 요정 정원에서 보랏빛 모자와 지팡이를 든 룰루 비공식 AI 팬아트",
  },
  {
    slug: "gwen",
    nameKo: "그웬",
    source: "gwen-source.png",
    alt: "파스텔 재봉 작업실에서 장식 가위를 든 그웬 비공식 AI 팬아트",
  },
];

const budgets = {
  cardWebp: 180_000,
  cardAvif: 130_000,
  heroWebp: 240_000,
  heroAvif: 180_000,
  ogPng: 650_000,
};

async function digest(path) {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

async function describe(path, budgetBytes) {
  const [file, metadata, sha256] = await Promise.all([
    stat(path),
    sharp(path).metadata(),
    digest(path),
  ]);

  return {
    path: path.replace(`${repoRoot}\\`, "").replaceAll("\\", "/"),
    width: metadata.width,
    height: metadata.height,
    format: path.endsWith(".avif") ? "avif" : metadata.format,
    bytes: file.size,
    sha256,
    budgetBytes,
    budgetPassed: file.size <= budgetBytes,
  };
}

function assetRecord({ id, character, purpose, alt, output, provenance }) {
  return {
    id,
    character,
    purpose,
    alt,
    aiGenerated: true,
    unofficialFanArt: true,
    officialRiotAsset: false,
    provenance,
    ...output,
  };
}

async function createCardAssets() {
  const records = [];

  for (const card of cards) {
    const sourcePath = resolve(sourceRoot, card.source);
    const sourceMetadata = await sharp(sourcePath).metadata();
    if (
      sourceMetadata.width !== sourceMetadata.height
      || !sourceMetadata.width
      || sourceMetadata.width < 768
    ) {
      throw new Error(`${card.source} must be a square image at least 768px wide`);
    }

    const webpPath = resolve(championRoot, `${card.slug}-card.webp`);
    const avifPath = resolve(championRoot, `${card.slug}-card.avif`);

    await sharp(sourcePath)
      .resize(768, 768, { fit: "cover" })
      .webp({ quality: 78, effort: 6, smartSubsample: true })
      .toFile(webpPath);

    await sharp(sourcePath)
      .resize(768, 768, { fit: "cover" })
      .avif({ quality: 50, effort: 6, chromaSubsampling: "4:4:4" })
      .toFile(avifPath);

    const provenance = {
      mode: "built-in image_gen",
      sourceArchive: `output/v2-visual-assets-20260901/${card.source}`,
      sourceWidth: sourceMetadata.width,
      sourceHeight: sourceMetadata.height,
      sourceBytes: (await stat(sourcePath)).size,
      sourceSha256: await digest(sourcePath),
    };

    records.push(
      assetRecord({
        id: `${card.slug}-card-webp`,
        character: card.nameKo,
        purpose: "반응형 기능 카드 장식",
        alt: card.alt,
        output: await describe(webpPath, budgets.cardWebp),
        provenance,
      }),
      assetRecord({
        id: `${card.slug}-card-avif`,
        character: card.nameKo,
        purpose: "반응형 기능 카드 장식",
        alt: card.alt,
        output: await describe(avifPath, budgets.cardAvif),
        provenance,
      }),
    );
  }

  return records;
}

async function createHeroAssets() {
  const sourcePath = resolve(brandRoot, "v2-hero-ahri.png");
  const sourceMetadata = await sharp(sourcePath).metadata();
  const sourceStats = await stat(sourcePath);
  const sourceSha256 = await digest(sourcePath);
  const provenance = {
    mode: "built-in image_gen",
    sourceArchive: "output/v2-art/klol-v2-hero-ahri-16x9.png",
    sourceWidth: sourceMetadata.width,
    sourceHeight: sourceMetadata.height,
    sourceBytes: sourceStats.size,
    sourceSha256,
  };
  const alt = "파스텔 하늘과 꽃잎 사이에서 여우불을 띄운 아리 비공식 AI 팬아트";

  const webpPath = resolve(brandRoot, "v2-hero-ahri-1600.webp");
  const avifPath = resolve(brandRoot, "v2-hero-ahri-1600.avif");

  await sharp(sourcePath)
    .resize(1600, 900, { fit: "cover", position: "centre" })
    .webp({ quality: 80, effort: 6, smartSubsample: true })
    .toFile(webpPath);

  await sharp(sourcePath)
    .resize(1600, 900, { fit: "cover", position: "centre" })
    .avif({ quality: 52, effort: 6, chromaSubsampling: "4:4:4" })
    .toFile(avifPath);

  return [
    assetRecord({
      id: "ahri-hero-webp",
      character: "아리",
      purpose: "홈 히어로 최적화 대안",
      alt,
      output: await describe(webpPath, budgets.heroWebp),
      provenance,
    }),
    assetRecord({
      id: "ahri-hero-avif",
      character: "아리",
      purpose: "홈 히어로 최적화 대안",
      alt,
      output: await describe(avifPath, budgets.heroAvif),
      provenance,
    }),
  ];
}

async function createOgAsset() {
  const sourcePath = resolve(brandRoot, "v2-hero-ahri.png");
  const ogPath = resolve(repoRoot, "public", "og.png");
  const sourceMetadata = await sharp(sourcePath).metadata();
  const sourceStats = await stat(sourcePath);
  const sourceSha256 = await digest(sourcePath);

  await sharp(sourcePath)
    .resize(1200, 630, { fit: "cover", position: "centre" })
    .png({
      compressionLevel: 9,
      effort: 10,
      palette: true,
      colours: 256,
      dither: 0.7,
    })
    .toFile(`${ogPath}.next`);

  const optimized = await readFile(`${ogPath}.next`);
  await writeFile(ogPath, optimized);
  await unlink(`${ogPath}.next`);

  return assetRecord({
    id: "ahri-open-graph-png",
    character: "아리",
    purpose: "Open Graph·Twitter 대형 카드",
    alt: "파스텔 하늘에서 여우불을 띄운 아리와 넓은 하늘 여백이 있는 K-LOL.GG V2 대표 이미지",
    output: await describe(ogPath, budgets.ogPng),
    provenance: {
      mode: "built-in image_gen source + deterministic Sharp optimization",
      sourceArchive: "output/v2-art/klol-v2-hero-ahri-16x9.png",
      sourceWidth: sourceMetadata.width,
      sourceHeight: sourceMetadata.height,
      sourceBytes: sourceStats.size,
      sourceSha256,
    },
  });
}

async function createContactSheet(records) {
  const width = 1800;
  const height = 1250;
  const cardSize = 304;
  const cardGap = 34;
  const cardStartX = 72;
  const cardY = 126;
  const svg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f4f8ff"/>
      <text x="72" y="70" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#1d2940">K-LOL.GG V2 unofficial AI fan-art asset QA</text>
      <text x="72" y="102" font-family="Arial, sans-serif" font-size="18" fill="#61708a">2026-09-01 · bright airy pastel pack · no official Riot source images</text>
      ${cards.map((card, index) => {
        const x = cardStartX + index * (cardSize + cardGap);
        return `<rect x="${x - 6}" y="${cardY - 6}" width="${cardSize + 12}" height="${cardSize + 12}" rx="30" fill="#ffffff" stroke="#dbe5f4" stroke-width="2"/><text x="${x}" y="${cardY + cardSize + 38}" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#33415c">${card.slug.toUpperCase()}</text>`;
      }).join("")}
      <text x="72" y="525" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#33415c">AHRI HERO · 1600×900 WEBP</text>
      <text x="972" y="525" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#33415c">OPEN GRAPH · 1200×630 PNG</text>
      <text x="72" y="1180" font-family="Arial, sans-serif" font-size="18" fill="#61708a">All character art: AI-generated, unofficial fan art. Performance budgets and SHA-256 values are recorded in asset-manifest.json.</text>
    </svg>
  `);

  const composites = [{ input: svg, top: 0, left: 0 }];
  for (const [index, card] of cards.entries()) {
    const input = await sharp(resolve(championRoot, `${card.slug}-card.webp`))
      .resize(cardSize, cardSize)
      .toBuffer();
    composites.push({
      input,
      left: cardStartX + index * (cardSize + cardGap),
      top: cardY,
    });
  }

  const hero = await sharp(resolve(brandRoot, "v2-hero-ahri-1600.webp"))
    .resize(820, 461)
    .toBuffer();
  const og = await sharp(resolve(repoRoot, "public", "og.png"))
    .resize(756, 397)
    .toBuffer();
  composites.push(
    { input: hero, left: 72, top: 555 },
    { input: og, left: 972, top: 555 },
  );

  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#f4f8ff",
    },
  })
    .composite(composites)
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(resolve(qaRoot, "contact-sheet.jpg"));

  const failed = records.filter((record) => !record.budgetPassed);
  if (failed.length > 0) {
    throw new Error(`Performance budgets failed: ${failed.map((record) => record.id).join(", ")}`);
  }
}

await mkdir(championRoot, { recursive: true });
await mkdir(qaRoot, { recursive: true });

const records = [
  ...(await createCardAssets()),
  ...(await createHeroAssets()),
  await createOgAsset(),
];

const manifest = {
  schemaVersion: 1,
  generatedOn: "2026-09-01",
  disclosure: "모든 챔피언 이미지는 built-in image_gen으로 새로 생성한 비공식 AI 팬아트이며 Riot Games 공식 원본 이미지가 아닙니다.",
  policyGate: "공개 전 Riot Games Legal Jibber Jabber 최신 정책과 화면 고지를 다시 검수해야 합니다.",
  budgets,
  assets: records,
};

await writeFile(
  resolve(championRoot, "asset-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
await createContactSheet(records);

console.log(JSON.stringify({
  assets: records.map(({ id, path, bytes, budgetBytes, budgetPassed, sha256 }) => ({
    id,
    path,
    bytes,
    budgetBytes,
    budgetPassed,
    sha256,
  })),
  contactSheet: "qa/2026-09-01-v2-visual-assets/contact-sheet.jpg",
}, null, 2));
