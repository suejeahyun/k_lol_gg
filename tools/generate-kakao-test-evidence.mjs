import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const outputDir = process.argv[2];
const count = Number(process.argv[3] || 30);

if (!outputDir || !Number.isInteger(count) || count < 1 || count > 100) {
  throw new Error("사용법: node tools/generate-kakao-test-evidence.mjs <outputDir> [count]");
}

await mkdir(outputDir, { recursive: true });

for (let index = 1; index <= count; index += 1) {
  const hue = (index * 47) % 360;
  const label = String(index).padStart(2, "0");
  const svg = `
    <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
      <rect width="1280" height="720" fill="hsl(${hue}, 58%, 18%)"/>
      <rect x="44" y="44" width="1192" height="632" rx="28" fill="none" stroke="#71b7ff" stroke-width="4"/>
      <text x="640" y="300" text-anchor="middle" fill="#ffffff" font-size="72" font-family="Arial, sans-serif" font-weight="700">K-LOL.GG TEST</text>
      <text x="640" y="410" text-anchor="middle" fill="#9ed0ff" font-size="96" font-family="Arial, sans-serif" font-weight="700">${label}</text>
      <text x="640" y="520" text-anchor="middle" fill="#dbeeff" font-size="34" font-family="Arial, sans-serif">2026-08-25 · synthetic evidence</text>
    </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(outputDir, `klol-test-${label}.png`));
}

console.log(`${count} test images generated in ${outputDir}`);
