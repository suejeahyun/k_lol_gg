import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

function readArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) throw new Error(`Invalid argument near ${key ?? "end"}.`);
    values.set(key.slice(2), value);
    index += 1;
  }
  return values;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function safeName(value) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9가-힣]+/g, "-").replace(/^-|-$/g, "") || "pages";
}

async function makeTile(screenshotDirectory, record) {
  const preview = await sharp(join(screenshotDirectory, record.screenshot))
    .resize(320, 220, { fit: "cover", position: "top" })
    .png()
    .toBuffer();
  const label = `${String(record.index).padStart(3, "0")} · ${record.status ?? "?"} · ${record.name}`;
  const secondary = record.requestedPath;
  const svg = Buffer.from(`<svg width="320" height="48" xmlns="http://www.w3.org/2000/svg">
    <rect width="320" height="48" rx="8" fill="#ffffff"/>
    <text x="10" y="19" font-family="Arial, 'Malgun Gothic', sans-serif" font-size="12" font-weight="700" fill="#16213d">${escapeXml(label.slice(0, 44))}</text>
    <text x="10" y="37" font-family="Arial, 'Malgun Gothic', sans-serif" font-size="11" fill="#52617d">${escapeXml(secondary.slice(0, 48))}</text>
  </svg>`);
  return sharp({ create: { width: 340, height: 288, channels: 4, background: "#eaf4ff" } })
    .composite([
      { input: preview, left: 10, top: 10 },
      { input: svg, left: 10, top: 234 },
    ])
    .png()
    .toBuffer();
}

async function main() {
  const args = readArguments(process.argv.slice(2));
  const screenshotDirectory = resolve(args.get("input") ?? "docs/qa-evidence/screenshots");
  const outputDirectory = resolve(args.get("output") ?? screenshotDirectory);
  const index = JSON.parse(await readFile(join(screenshotDirectory, "index.json"), "utf8"));
  const groups = Map.groupBy(index.routes, (record) => record.group ?? "public");
  const columns = 3;
  const maximumRowsPerSheet = 12;
  const perSheet = columns * maximumRowsPerSheet;
  const sheetRecords = [];
  await mkdir(outputDirectory, { recursive: true });

  for (const [group, records] of groups) {
    for (let offset = 0; offset < records.length; offset += perSheet) {
      const chunk = records.slice(offset, offset + perSheet);
      const rows = Math.ceil(chunk.length / columns);
      const tiles = await Promise.all(chunk.map((record) => makeTile(screenshotDirectory, record)));
      const background = sharp({
        create: {
          width: columns * 340 + 40,
          height: rows * 288 + 80,
          channels: 4,
          background: "#f7fbff",
        },
      });
      const title = Buffer.from(`<svg width="${columns * 340}" height="52" xmlns="http://www.w3.org/2000/svg">
        <text x="0" y="28" font-family="Arial, 'Malgun Gothic', sans-serif" font-size="22" font-weight="700" fill="#16213d">K-LOL.GG V2 · ${escapeXml(group)} · ${offset + 1}-${offset + chunk.length}</text>
        <text x="0" y="47" font-family="Arial, 'Malgun Gothic', sans-serif" font-size="12" fill="#52617d">각 타일은 전체 높이 원본 PNG의 상단 미리보기입니다.</text>
      </svg>`);
      const composites = [{ input: title, left: 20, top: 12 }];
      for (const [tileIndex, tile] of tiles.entries()) {
        composites.push({
          input: tile,
          left: 20 + (tileIndex % columns) * 340,
          top: 68 + Math.floor(tileIndex / columns) * 288,
        });
      }
      const part = Math.floor(offset / perSheet) + 1;
      const fileName = `contact-${safeName(group)}-${String(part).padStart(2, "0")}.png`;
      await background.composite(composites).png({ compressionLevel: 9 }).toFile(join(outputDirectory, fileName));
      sheetRecords.push({ group, part, firstIndex: offset + 1, lastIndex: offset + chunk.length, fileName });
      process.stdout.write(`[contact-sheet] ${group} ${part} -> ${fileName}\n`);
    }
  }
  await writeFile(join(outputDirectory, "contact-sheets.json"), `${JSON.stringify(sheetRecords, null, 2)}\n`);
  const markdown = [
    "# K-LOL.GG V2 전체 페이지 화면 검수",
    "",
    `- 캡처 시각: ${index.capturedAt}`,
    `- 기준 주소: ${index.origin}`,
    `- 전체 화면: ${index.routes.length}개`,
    `- 자동 감지 문제: ${index.routes.reduce((count, record) => count + (record.issues?.length ?? 0), 0)}개`,
    "",
    "## 한눈에 보기",
    "",
    ...sheetRecords.flatMap((sheet) => [
      `### ${sheet.group} ${sheet.part}`,
      "",
      `![${sheet.group} ${sheet.part}](./${sheet.fileName})`,
      "",
    ]),
    "## 원본 전체 높이 PNG",
    "",
    "| 번호 | 그룹 | 요청 경로 | 최종 상태 | 크기 | 자동 점검 | 원본 |",
    "| ---: | --- | --- | ---: | --- | --- | --- |",
    ...index.routes.map((record) => `| ${record.index} | ${record.group} | \`${String(record.requestedPath).replaceAll("|", "\\|")}\` | ${record.status ?? "?"} | ${record.capturedWidth ?? "?"}×${record.capturedHeight ?? "?"} | ${record.issues?.length ? record.issues.join(", ") : "통과"} | [PNG](./${record.screenshot}) |`),
    "",
  ].join("\n");
  await writeFile(join(outputDirectory, "README.md"), markdown);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
