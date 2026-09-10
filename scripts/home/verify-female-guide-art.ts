import { createHash } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import {
  HOME_GUIDE_CHAMPION_COUNT,
  HOME_GUIDE_CHAMPIONS,
} from "../../src/modules/home/domain/home-guide-champions";

const publicRoot = path.resolve("public");
const artDirectory = path.join(publicRoot, "images", "home", "champions-v2");
const expectedWidth = 1_672;
const expectedHeight = 940;
const expectedExtensions = ["webp"] as const;
const errors: string[] = [];
const hashes = new Map<string, string>();

if (HOME_GUIDE_CHAMPIONS.length !== HOME_GUIDE_CHAMPION_COUNT) {
  errors.push(
    `정책 수량 불일치: ${HOME_GUIDE_CHAMPIONS.length}/${HOME_GUIDE_CHAMPION_COUNT}`,
  );
}

const expectedFiles = new Set<string>();

for (const champion of HOME_GUIDE_CHAMPIONS) {
  for (const extension of expectedExtensions) {
    const publicPath = champion.artWebpSrc;
    const expectedSuffix = `.${extension}`;
    if (!publicPath.endsWith(expectedSuffix)) {
      errors.push(`${champion.id}: ${extension.toUpperCase()} 경로 확장자가 올바르지 않습니다.`);
      continue;
    }

    const relativePath = publicPath.replace(/^\/+/, "");
    const absolutePath = path.join(publicRoot, relativePath);
    expectedFiles.add(path.basename(absolutePath));
    if (!existsSync(absolutePath)) {
      errors.push(`${champion.id}: ${relativePath} 파일이 없습니다.`);
      continue;
    }

    try {
      const [buffer, metadata, stats] = await Promise.all([
        fs.readFile(absolutePath),
        sharp(absolutePath).metadata(),
        fs.stat(absolutePath),
      ]);
      const decodedFormat = metadata.format === "heif" ? "avif" : metadata.format;
      if (decodedFormat !== extension) {
        errors.push(`${champion.id}: ${extension.toUpperCase()} 디코딩 형식이 ${metadata.format}입니다.`);
      }
      if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) {
        errors.push(
          `${champion.id}: ${extension.toUpperCase()} 크기가 ${metadata.width}x${metadata.height}입니다.`,
        );
      }
      if (stats.size < 40_000 || stats.size > 500_000) {
        errors.push(`${champion.id}: ${extension.toUpperCase()} 용량이 ${stats.size}바이트입니다.`);
      }

      const hash = createHash("sha256").update(buffer).digest("hex");
      const previous = hashes.get(hash);
      if (previous) {
        errors.push(`${champion.id}: ${extension.toUpperCase()}가 ${previous}와 중복됩니다.`);
      } else {
        hashes.set(hash, `${champion.id}.${extension}`);
      }
    } catch (error) {
      errors.push(
        `${champion.id}: ${extension.toUpperCase()} 디코딩 실패 (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }
}

const actualFiles = (await fs.readdir(artDirectory))
  .filter((fileName) => /\.(?:avif|webp)$/u.test(fileName));

for (const fileName of actualFiles) {
  if (!expectedFiles.has(fileName)) errors.push(`정책에 없는 배포 파일: ${fileName}`);
}

if (actualFiles.length !== HOME_GUIDE_CHAMPION_COUNT * expectedExtensions.length) {
  errors.push(
    `배포 파일 수 불일치: ${actualFiles.length}/${HOME_GUIDE_CHAMPION_COUNT * expectedExtensions.length}`,
  );
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `여성 챔피언 ${HOME_GUIDE_CHAMPION_COUNT}명 · 개별 이미지 ${actualFiles.length}개 · `
      + `${expectedWidth}x${expectedHeight} · SHA-256 중복 0건`,
  );
}
