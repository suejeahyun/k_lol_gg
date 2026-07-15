import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";

const root = process.cwd();

function iconSvg(size = 512) {
  return `
<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="36%" r="76%">
      <stop offset="0" stop-color="#153d86"/>
      <stop offset="0.45" stop-color="#081a3a"/>
      <stop offset="1" stop-color="#030712"/>
    </radialGradient>
    <linearGradient id="rim" x1="78" y1="74" x2="430" y2="444" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#6ee7ff"/>
      <stop offset="0.5" stop-color="#2f7cff"/>
      <stop offset="1" stop-color="#caa45a"/>
    </linearGradient>
    <linearGradient id="k" x1="112" y1="126" x2="396" y2="398" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.42" stop-color="#d9f7ff"/>
      <stop offset="0.72" stop-color="#44b8ff"/>
      <stop offset="1" stop-color="#f2ca70"/>
    </linearGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.08 0 0 0 0 0.45 0 0 0 0 1 0 0 0 .85 0"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="clip"><rect x="24" y="24" width="464" height="464" rx="112"/></clipPath>
  </defs>
  <rect width="512" height="512" fill="#030712"/>
  <g clip-path="url(#clip)">
    <rect x="24" y="24" width="464" height="464" rx="112" fill="url(#bg)"/>
    <path d="M64 374 C138 432 278 450 442 356" stroke="#174b9e" stroke-width="32" opacity="0.45" fill="none"/>
    <path d="M370 40 L446 132 L401 248 L458 352 L342 452 L208 430 L82 452 L54 310 L94 196 L82 82 Z" fill="none" stroke="#2aa8ff" stroke-width="2" opacity="0.22"/>
    <path d="M262 58 L286 136 L364 158 L292 196 L276 286 L224 208 L130 194 L218 150 Z" fill="#3cc7ff" opacity="0.16"/>
    <circle cx="392" cy="112" r="88" fill="#0f69ff" opacity="0.18"/>
    <circle cx="134" cy="386" r="130" fill="#071123" opacity="0.5"/>
  </g>
  <rect x="24" y="24" width="464" height="464" rx="112" fill="none" stroke="url(#rim)" stroke-width="10"/>
  <rect x="44" y="44" width="424" height="424" rx="96" fill="none" stroke="#aeeaff" stroke-opacity="0.18" stroke-width="2"/>
  <g filter="url(#glow)">
    <path d="M142 126 H218 V236 L326 126 H418 L306 244 L430 386 H332 L242 282 L218 307 V386 H142 Z" fill="url(#k)"/>
    <path d="M142 126 H218 V236 L326 126 H418 L306 244 L430 386 H332 L242 282 L218 307 V386 H142 Z" fill="none" stroke="#f7fbff" stroke-opacity="0.28" stroke-width="3"/>
  </g>
  <path d="M104 420 H408" stroke="#2dd4ff" stroke-width="8" stroke-linecap="round" opacity="0.7"/>
  <path d="M160 436 H352" stroke="#f2ca70" stroke-width="5" stroke-linecap="round" opacity="0.72"/>
</svg>`;
}

function splashSvg(width = 2732, height = 2732) {
  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="70%">
      <stop offset="0" stop-color="#123d83"/>
      <stop offset="0.44" stop-color="#07172f"/>
      <stop offset="1" stop-color="#02040a"/>
    </radialGradient>
    <linearGradient id="line" x1="0" x2="1">
      <stop offset="0" stop-color="#0a1020"/>
      <stop offset="0.5" stop-color="#2dd4ff"/>
      <stop offset="1" stop-color="#0a1020"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <circle cx="${width / 2}" cy="${height / 2}" r="620" fill="#38bdf8" opacity="0.08"/>
  <circle cx="${width / 2}" cy="${height / 2}" r="390" fill="#f2ca70" opacity="0.06"/>
  <path d="M${width * 0.14} ${height * 0.7} C${width * 0.38} ${height * 0.46} ${width * 0.62} ${height * 0.46} ${width * 0.86} ${height * 0.7}" stroke="url(#line)" stroke-width="12" fill="none" opacity="0.3"/>
  <path d="M${width * 0.18} ${height * 0.34} C${width * 0.42} ${height * 0.52} ${width * 0.58} ${height * 0.52} ${width * 0.82} ${height * 0.34}" stroke="#2767d9" stroke-width="8" fill="none" opacity="0.3"/>
  <g transform="translate(${width / 2 - 192}, ${height / 2 - 192}) scale(0.75)">
    ${iconSvg(512).replace(/<svg[^>]*>|<\/svg>/g, "")}
  </g>
  <text x="50%" y="${height / 2 + 350}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="96" font-weight="800" fill="#f8fbff" letter-spacing="8">K-LOL.GG</text>
</svg>`;
}

async function writePng(file, svg, width, height) {
  mkdirSync(dirname(file), { recursive: true });
  await sharp(Buffer.from(svg)).resize(width, height).png().toFile(file);
}

await writePng(join(root, "public/icons/icon-192.png"), iconSvg(), 192, 192);
await writePng(join(root, "public/icons/icon-512.png"), iconSvg(), 512, 512);
await writePng(join(root, "public/apple-touch-icon.png"), iconSvg(), 180, 180);

for (const [dir, size] of [
  ["mipmap-mdpi", 48],
  ["mipmap-hdpi", 72],
  ["mipmap-xhdpi", 96],
  ["mipmap-xxhdpi", 144],
  ["mipmap-xxxhdpi", 192],
]) {
  const base = join(root, "android/app/src/main/res", dir);
  await writePng(join(base, "ic_launcher.png"), iconSvg(), size, size);
  await writePng(join(base, "ic_launcher_round.png"), iconSvg(), size, size);
  await writePng(join(base, "ic_launcher_foreground.png"), iconSvg(), size, size);
}

for (const [file, width, height] of [
  ["drawable/splash.png", 2732, 2732],
  ["drawable-land-mdpi/splash.png", 320, 200],
  ["drawable-land-hdpi/splash.png", 480, 320],
  ["drawable-land-xhdpi/splash.png", 720, 480],
  ["drawable-land-xxhdpi/splash.png", 960, 640],
  ["drawable-land-xxxhdpi/splash.png", 1280, 960],
  ["drawable-port-mdpi/splash.png", 200, 320],
  ["drawable-port-hdpi/splash.png", 320, 480],
  ["drawable-port-xhdpi/splash.png", 480, 720],
  ["drawable-port-xxhdpi/splash.png", 640, 960],
  ["drawable-port-xxxhdpi/splash.png", 960, 1280],
]) {
  await writePng(join(root, "android/app/src/main/res", file), splashSvg(width, height), width, height);
}

console.log("K-LOL.GG app icons and Android splash assets regenerated.");
