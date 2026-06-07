export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import sharp from "sharp";
import Tesseract from "tesseract.js";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import type {
  LolResultImportResponse,
  LolResultImportRow,
} from "@/features/match/lol-result-import-types";

type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ChampionImage = {
  id: number;
  name: string;
  imageUrl: string;
  colorFingerprint: Buffer;
  hashBits: string;
};

const CHAMPION_COMPARE_SIZE = 24;
const MIN_CHAMPION_CONFIDENCE = 0.97;

const TESSERACT_WORKER_PATH = path.join(
  process.cwd(),
  "node_modules",
  "tesseract.js",
  "src",
  "worker-script",
  "node",
  "index.js",
);

const NORMALIZED_SCOREBOARD_WIDTH = 1048;
const NORMALIZED_SCOREBOARD_HEIGHT = 622;
const NORMALIZED_TOP_TEAM_HEADER_Y = 157;
const NORMALIZED_RESULT_TITLE_Y = 8;

function clampRect(rect: Rect, imageWidth: number, imageHeight: number): Rect {
  const left = Math.max(0, Math.min(imageWidth - 1, Math.round(rect.left)));
  const top = Math.max(0, Math.min(imageHeight - 1, Math.round(rect.top)));
  const width = Math.max(
    1,
    Math.min(imageWidth - left, Math.round(rect.width)),
  );
  const height = Math.max(
    1,
    Math.min(imageHeight - top, Math.round(rect.height)),
  );

  return { left, top, width, height };
}

async function cropBuffer(
  image: sharp.Sharp,
  rect: Rect,
  imageWidth: number,
  imageHeight: number,
) {
  return image
    .clone()
    .extract(clampRect(rect, imageWidth, imageHeight))
    .png()
    .toBuffer();
}

async function recognizeText(
  buffer: Buffer,
  language: string,
  whitelist?: string,
  pageSegMode?: string,
  extraParams?: Record<string, string>,
) {
  try {
    const result = await Tesseract.recognize(buffer, language, {
      workerPath: TESSERACT_WORKER_PATH,
      logger: () => undefined,
      ...(whitelist
        ? {
            tessedit_char_whitelist: whitelist,
          }
        : {}),
      ...(pageSegMode
        ? {
            tessedit_pageseg_mode: pageSegMode,
          }
        : {}),
      ...(extraParams ?? {}),
    });

    return result.data.text.replace(/\s+/g, " ").trim();
  } catch (error) {
    console.error("[LOL_RESULT_OCR_ERROR]", error);
    return "";
  }
}

async function recognizePlayerName(buffer: Buffer) {
  // 닉네임은 한글/영문/숫자/공백/일부 기호가 섞인다.
  // 따라서 whitelist를 강하게 걸지 않고 kor+eng으로 한 줄 OCR만 수행한다.
  return recognizeText(
    await preprocessForOcr(buffer),
    "kor+eng",
    undefined,
    "7",
    {
      preserve_interword_spaces: "1",
    },
  );
}

const KDA_OCR_WHITELIST = "0123456789/";
const KDA_OCR_PARAMS = {
  tessedit_char_whitelist: KDA_OCR_WHITELIST,
  classify_bln_numeric_mode: "1",
  preserve_interword_spaces: "0",
};

function parseKda(text: string) {
  const raw = text.replace(/\s+/g, " ").trim();

  const repaired = raw
    // KDA 첫 숫자를 OCR이 기호로 읽는 대표 케이스 보정.
    .replace(/^\s*[)）]/, "9")
    .replace(/^\s*[>»]/, "6")
    .replace(/^\s*[lI|]/, "1")
    .replace(/[|\[\]Il!Jj]/g, "/")
    .replace(/[Oo]/g, "0")
    .replace(/[&]/g, "4")
    .replace(/[,_{}:%]/g, " ")
    .replace(/\b9[04]\b/g, "11")
    .replace(/[^0-9/\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const slashMatch = repaired.match(
    /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})/,
  );
  if (slashMatch) {
    const kills = Number(slashMatch[1]);
    const rawDeaths = Number(slashMatch[2]);
    const assists = Number(slashMatch[3]);

    // Tesseract가 두 번째 구분자 '/'를 숫자 1로 합쳐 읽는 대표 케이스.
    // 예: 5/51/8 -> 5/5/8, 9/51/6 -> 9/5/6, 4/51/6 -> 4/5/6
    if (rawDeaths >= 50 && rawDeaths <= 59) {
      return normalizeKdaNumbers([kills, Math.floor(rawDeaths / 10), assists]);
    }

    return normalizeKdaNumbers([kills, rawDeaths, assists]);
  }

  const compactSecondSlashMatch = repaired.match(
    /^(\d{1,2})\s*\/\s*(\d)1(\d{1,2})$/,
  );
  if (compactSecondSlashMatch) {
    return normalizeKdaNumbers([
      Number(compactSecondSlashMatch[1]),
      Number(compactSecondSlashMatch[2]),
      Number(compactSecondSlashMatch[3]),
    ]);
  }

  const numbers = (repaired.match(/\d+/g) ?? []).map(Number);

  // OCR이 두 번째 slash를 숫자 1로 읽는 대표 케이스.
  // 예: "6 /5 1/10" -> [6, 5, 1, 10], "9/5 1/6" -> [9, 5, 1, 6]
  if (numbers.length >= 4 && numbers[2] === 1) {
    return normalizeKdaNumbers([numbers[0], numbers[1], numbers[3]]);
  }

  // OCR이 두 번째 slash와 어시스트를 한 덩어리로 붙여 읽는 케이스.
  // 예: "9/516" -> [9, 516] -> 9/5/6, "4/5116" -> 4/5/16
  if (numbers.length === 2) {
    const kills = numbers[0];
    const mergedDeathsAssists = String(numbers[1]);
    if (mergedDeathsAssists.length >= 2 && mergedDeathsAssists[1] === "1") {
      const deaths = Number(mergedDeathsAssists[0]);
      const assists = Number(mergedDeathsAssists.slice(2));
      if (Number.isFinite(deaths) && Number.isFinite(assists)) {
        return normalizeKdaNumbers([kills, deaths, assists]);
      }
    }
  }

  if (numbers.length >= 3) {
    const [rawKills, rawDeaths, rawAssists] = numbers;

    // Tesseract가 두 번째 구분자 '/'를 숫자 1로 합쳐 읽는 대표 케이스.
    // 예: 5/51/8 -> 5/5/8, 9/51/6 -> 9/5/6, 4 /51/]6 -> 4/5/6
    if (rawDeaths >= 50 && rawDeaths <= 59) {
      return normalizeKdaNumbers([
        rawKills,
        Math.floor(rawDeaths / 10),
        rawAssists,
      ]);
    }

    return normalizeKdaNumbers([rawKills, rawDeaths, rawAssists]);
  }

  return emptyKda();
}

function emptyKda() {
  return {
    kills: null as number | null,
    deaths: null as number | null,
    assists: null as number | null,
  };
}

function normalizeKdaNumbers(numbers: number[]) {
  const [kills, deaths, assists] = numbers;

  // 롤 1판 KDA에서 90대 같은 값은 OCR이 CS/골드 일부를 잘못 읽은 경우로 본다.
  // 잘못된 숫자를 저장하는 것보다 수동 확인으로 남기는 편이 안전하다.
  if (
    !Number.isFinite(kills) ||
    !Number.isFinite(deaths) ||
    !Number.isFinite(assists) ||
    kills < 0 ||
    deaths < 0 ||
    assists < 0 ||
    kills > 40 ||
    deaths > 40 ||
    assists > 60
  ) {
    return emptyKda();
  }

  return { kills, deaths, assists };
}

function isParsedKda(value: ReturnType<typeof parseKda>) {
  return (
    value.kills !== null && value.deaths !== null && value.assists !== null
  );
}

async function preprocessKdaForOcr(buffer: Buffer) {
  return sharp(buffer)
    .grayscale()
    .resize({
      width: 820,
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .normalize()
    .threshold(120)
    .negate()
    .extend({ top: 18, bottom: 18, left: 24, right: 24, background: "white" })
    .png()
    .toBuffer();
}

async function preprocessKdaUpscaledForOcr(buffer: Buffer) {
  return sharp(buffer)
    .grayscale()
    .resize({
      width: 1180,
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .sharpen({ sigma: 1.15, m1: 1.05, m2: 1.8 })
    .normalize()
    .threshold(135)
    .negate()
    .extend({ top: 24, bottom: 24, left: 32, right: 32, background: "white" })
    .png()
    .toBuffer();
}

async function preprocessKdaYellowMaskForOcr(buffer: Buffer) {
  const scale = 8;
  const metadata = await sharp(buffer).metadata();
  const baseWidth = Math.max(1, metadata.width ?? 130);
  const baseHeight = Math.max(1, metadata.height ?? 34);
  const width = baseWidth * scale;
  const height = baseHeight * scale;

  const rgb = await sharp(buffer)
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .removeAlpha()
    .raw()
    .toBuffer();

  const mask = Buffer.alloc(width * height);
  for (let i = 0, p = 0; i < rgb.length; i += 3, p += 1) {
    const r = rgb[i] ?? 0;
    const g = rgb[i + 1] ?? 0;
    const b = rgb[i + 2] ?? 0;

    // 롤 결과창 KDA 숫자는 금색/흰색 계열이다.
    // 배경/아이콘 색을 제거하고 숫자 획만 남겨 OCR 정확도를 높인다.
    const isGoldText = r >= 135 && g >= 105 && b <= 120;
    const isWhiteText = r >= 175 && g >= 175 && b >= 165;
    mask[p] = isGoldText || isWhiteText ? 255 : 0;
  }

  return sharp(mask, { raw: { width, height, channels: 1 } })
    .threshold(80)
    .extend({
      top: 24,
      bottom: 24,
      left: 32,
      right: 32,
      background: { r: 0, g: 0, b: 0 },
    })
    .png()
    .toBuffer();
}

function scoreKdaOcrText(text: string, parsed: ReturnType<typeof parseKda>) {
  if (!isParsedKda(parsed)) return -1;

  let score = 0;
  const slashCount = (text.match(/\//g) ?? []).length;
  const digitCount = (text.match(/\d/g) ?? []).length;

  if (slashCount >= 2) score += 4;
  if (digitCount >= 3 && digitCount <= 6) score += 2;
  if (/\d\s*\/\s*\d/.test(text)) score += 1;

  // 51, 112 같은 덩어리는 보정 가능하지만 신뢰도는 조금 낮춘다.
  if (/\b\d{3,}\b/.test(text)) score -= 2;
  if (/[A-Za-z가-힣]/.test(text)) score -= 1;

  return score;
}

async function recognizeKda(buffer: Buffer) {
  const [basicText, enhancedText, upscaledText, yellowMaskText] =
    await Promise.all([
      recognizeText(
        await preprocessForOcr(buffer),
        "eng",
        KDA_OCR_WHITELIST,
        "7",
        KDA_OCR_PARAMS,
      ),
      recognizeText(
        await preprocessKdaForOcr(buffer),
        "eng",
        KDA_OCR_WHITELIST,
        "7",
        KDA_OCR_PARAMS,
      ),
      recognizeText(
        await preprocessKdaUpscaledForOcr(buffer),
        "eng",
        KDA_OCR_WHITELIST,
        "7",
        KDA_OCR_PARAMS,
      ),
      recognizeText(
        await preprocessKdaYellowMaskForOcr(buffer),
        "eng",
        KDA_OCR_WHITELIST,
        "7",
        KDA_OCR_PARAMS,
      ),
    ]);

  const candidates = [basicText, enhancedText, upscaledText, yellowMaskText]
    .map((text) => ({ text, kda: parseKda(text) }))
    .map((candidate) => ({
      ...candidate,
      score: scoreKdaOcrText(candidate.text, candidate.kda),
    }))
    .sort((a, b) => b.score - a.score);

  const best = candidates.find(
    (candidate) => candidate.score >= 0 && isParsedKda(candidate.kda),
  );
  if (best) {
    return { text: best.text, kda: best.kda };
  }

  // 모두 실패했으면 더 많은 원문 정보를 로그에 남긴다.
  return {
    text: [basicText, enhancedText, upscaledText, yellowMaskText]
      .filter(Boolean)
      .join(" | "),
    kda: emptyKda(),
  };
}

async function makeChampionCenterBuffer(buffer: Buffer) {
  const normalized = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize(64, 64, {
      fit: "cover",
      position: "centre",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  // Sharp의 operation 순서 때문에 원본 이미지가 작거나 경고가 있는 경우
  // resize().extract() 체인이 extract_area 오류를 낼 수 있다.
  // 먼저 64x64로 확정 변환한 뒤 다시 extract해서 항상 유효한 영역만 자른다.
  return sharp(normalized, { failOn: "none" })
    .extract({ left: 8, top: 8, width: 48, height: 48 })
    .png()
    .toBuffer();
}

async function makeChampionColorFingerprint(buffer: Buffer) {
  const centerBuffer = await makeChampionCenterBuffer(buffer);

  return sharp(centerBuffer, { failOn: "none" })
    .normalize()
    .resize(CHAMPION_COMPARE_SIZE, CHAMPION_COMPARE_SIZE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
}

async function makeDifferenceHash(buffer: Buffer) {
  const width = 9;
  const height = 8;
  const centerBuffer = await makeChampionCenterBuffer(buffer);
  const pixels = await sharp(centerBuffer, { failOn: "none" })
    .grayscale()
    .normalize()
    .resize(width, height, { fit: "fill" })
    .raw()
    .toBuffer();

  let bits = "";
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const left = pixels[y * width + x] ?? 0;
      const right = pixels[y * width + x + 1] ?? 0;
      bits += left > right ? "1" : "0";
    }
  }

  return bits;
}

async function makeChampionSignature(buffer: Buffer) {
  const [colorFingerprint, hashBits] = await Promise.all([
    makeChampionColorFingerprint(buffer),
    makeDifferenceHash(buffer),
  ]);

  return { colorFingerprint, hashBits };
}

function compareColorFingerprints(a: Buffer, b: Buffer) {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;

  let diff = 0;
  for (let index = 0; index < length; index += 1) {
    diff += Math.abs(a[index] - b[index]);
  }

  const maxDiff = length * 255;
  return Math.max(0, 1 - diff / maxDiff);
}

function compareHashBits(a: string, b: string) {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;

  let same = 0;
  for (let index = 0; index < length; index += 1) {
    if (a[index] === b[index]) same += 1;
  }

  return same / length;
}

function compareChampionSignatures(
  captured: Awaited<ReturnType<typeof makeChampionSignature>>,
  champion: ChampionImage,
) {
  const colorScore = compareColorFingerprints(
    captured.colorFingerprint,
    champion.colorFingerprint,
  );
  const hashScore = compareHashBits(captured.hashBits, champion.hashBits);

  // 색상만 비교하면 비슷한 팔레트 챔피언끼리 자주 틀린다.
  // 구조 해시를 섞어서 원형 테두리/축소 이미지에서도 후보 순위를 더 안정화한다.
  return colorScore * 0.58 + hashScore * 0.42;
}

async function loadChampionImages() {
  const champions = await prisma.champion.findMany({
    select: { id: true, name: true, imageUrl: true },
    orderBy: { id: "asc" },
  });

  const loaded: ChampionImage[] = [];

  await Promise.all(
    champions.map(async (champion) => {
      try {
        const response = await fetch(champion.imageUrl, {
          cache: "force-cache",
        });
        if (!response.ok) return;

        const arrayBuffer = await response.arrayBuffer();
        const signature = await makeChampionSignature(Buffer.from(arrayBuffer));
        loaded.push({ ...champion, ...signature });
      } catch (error) {
        console.error(
          "[LOL_RESULT_CHAMPION_IMAGE_LOAD_ERROR]",
          champion.name,
          error,
        );
      }
    }),
  );

  return loaded;
}

async function detectResultTitleTop(
  imageBuffer: Buffer,
  imageWidth: number,
  imageHeight: number,
) {
  try {
    const cropLeft = Math.round(imageWidth * 0.035);
    const cropTop = 0;
    const cropWidth = Math.round(imageWidth * 0.32);
    const cropHeight = Math.round(imageHeight * 0.24);
    const { data, info } = await sharp(imageBuffer)
      .rotate()
      .extract(
        clampRect(
          {
            left: cropLeft,
            top: cropTop,
            width: cropWidth,
            height: cropHeight,
          },
          imageWidth,
          imageHeight,
        ),
      )
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const rowScores: number[] = [];
    for (let y = 0; y < info.height; y += 1) {
      let score = 0;
      for (let x = 0; x < info.width; x += 1) {
        const value = data[y * info.width + x] ?? 0;
        if (value > 145) score += 1;
      }
      rowScores.push(score);
    }

    const threshold = Math.max(8, info.width * 0.018);
    const groups: Array<{ top: number; bottom: number; total: number }> = [];
    let current: { top: number; bottom: number; total: number } | null = null;

    for (let y = 0; y < rowScores.length; y += 1) {
      const score = rowScores[y] ?? 0;
      if (score >= threshold) {
        if (!current) current = { top: y, bottom: y, total: 0 };
        current.bottom = y;
        current.total += score;
      } else if (current) {
        const finishedGroup = current;
        if (finishedGroup.bottom - finishedGroup.top >= 6) groups.push(finishedGroup);
        current = null;
      }
    }
    if (current) {
      const finishedGroup = current;
      if (finishedGroup.bottom - finishedGroup.top >= 6) groups.push(finishedGroup);
    }

    const candidate = groups
      .filter(
        (group) =>
          group.top > imageHeight * 0.005 && group.top < imageHeight * 0.18,
      )
      .sort((left, right) => right.total - left.total)[0];

    if (!candidate) return null;
    return cropTop + candidate.top;
  } catch (error) {
    console.error("[LOL_RESULT_TITLE_ANCHOR_ERROR]", error);
    return null;
  }
}

async function detectTeamHeaderAnchors(
  imageBuffer: Buffer,
  imageWidth: number,
  imageHeight: number,
) {
  try {
    // 팀 헤더는 화면 왼쪽의 "1번 팀", "2번 팀" 텍스트만 사용한다.
    // 이전처럼 넓은 영역을 보면 팀 KDA 숫자, 챔피언 아이콘, 밴픽 영역의 색까지 섞여
    // bottomTeamHeaderY가 300px 또는 440px대로 오검출된다.
    const crop = clampRect(
      {
        left: imageWidth * 0.018,
        top: imageHeight * 0.16,
        width: imageWidth * 0.095,
        height: imageHeight * 0.58,
      },
      imageWidth,
      imageHeight,
    );

    const { data, info } = await sharp(imageBuffer)
      .rotate()
      .extract(crop)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const cyanScores: number[] = [];
    const redScores: number[] = [];

    for (let y = 0; y < info.height; y += 1) {
      let cyan = 0;
      let red = 0;
      for (let x = 0; x < info.width; x += 1) {
        const offset = (y * info.width + x) * info.channels;
        const r = data[offset] ?? 0;
        const g = data[offset + 1] ?? 0;
        const b = data[offset + 2] ?? 0;

        // 1번 팀 텍스트: 청록, 2번 팀 텍스트: 빨강.
        if (b > 115 && g > 95 && r < 105 && b - r > 35) cyan += 1;
        if (r > 125 && b > 55 && g < 105 && r - g > 35) red += 1;
      }
      cyanScores.push(cyan);
      redScores.push(red);
    }

    const findGroupCenter = (
      scores: number[],
      minAbsoluteY: number,
      maxAbsoluteY: number,
    ) => {
      const threshold = Math.max(2, info.width * 0.018);
      const groups: Array<{ top: number; bottom: number; total: number }> = [];
      let current: { top: number; bottom: number; total: number } | null = null;

      for (let localY = 0; localY < scores.length; localY += 1) {
        const score = scores[localY] ?? 0;
        const absoluteY = crop.top + localY;

        if (absoluteY < minAbsoluteY || absoluteY > maxAbsoluteY) {
          if (current) {
            const finishedGroup = current;
            if (finishedGroup.bottom - finishedGroup.top >= 2) groups.push(finishedGroup);
            current = null;
          }
          continue;
        }

        if (score >= threshold) {
          if (!current) current = { top: localY, bottom: localY, total: 0 };
          current.bottom = localY;
          current.total += score;
        } else if (current) {
          const finishedGroup = current;
          if (finishedGroup.bottom - finishedGroup.top >= 2) groups.push(finishedGroup);
          current = null;
        }
      }
      if (current) {
        const finishedGroup = current;
        if (finishedGroup.bottom - finishedGroup.top >= 2) groups.push(finishedGroup);
      }

      const candidate = groups.sort((left, right) => left.top - right.top)[0];

      if (!candidate) return null;
      return crop.top + Math.round((candidate.top + candidate.bottom) / 2);
    };

    const topTeamHeaderY = findGroupCenter(
      cyanScores,
      imageHeight * 0.2,
      imageHeight * 0.36,
    );

    // 2번 팀은 1번 팀 5개 행이 끝난 뒤에만 탐색한다.
    // 그래도 실패하면 getRowCenters에서 TOP 기준 추정값을 사용한다.
    const bottomSearchMin =
      typeof topTeamHeaderY === "number"
        ? topTeamHeaderY + imageHeight * 0.31
        : imageHeight * 0.5;

    const bottomTeamHeaderY = findGroupCenter(
      redScores,
      bottomSearchMin,
      imageHeight * 0.7,
    );

    return { topTeamHeaderY, bottomTeamHeaderY };
  } catch (error) {
    console.error("[LOL_RESULT_TEAM_HEADER_ANCHOR_ERROR]", error);
    return { topTeamHeaderY: null, bottomTeamHeaderY: null };
  }
}

async function extractRectWithPadding(
  imageBuffer: Buffer,
  rect: Rect,
  outputWidth: number,
  outputHeight: number,
) {
  const source = sharp(imageBuffer).rotate();
  const metadata = await source.metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("이미지 크기를 읽지 못했습니다.");
  }

  // Sharp extract는 left/top이 원본 밖이거나, 최종 extract 크기가 실제 이미지보다 크면
  // extract_area 오류를 낸다. 그래서 원본에서 실제로 존재하는 영역만 잘라낸 뒤,
  // 1048x622 배경 캔버스에 composite 하는 방식으로 처리한다.
  const requestedLeft = Math.round(rect.left);
  const requestedTop = Math.round(rect.top);
  const requestedRight = Math.round(rect.left + rect.width);
  const requestedBottom = Math.round(rect.top + rect.height);

  let sourceLeft = Math.max(0, Math.min(sourceWidth - 1, requestedLeft));
  let sourceTop = Math.max(0, Math.min(sourceHeight - 1, requestedTop));
  let sourceRight = Math.max(sourceLeft + 1, Math.min(sourceWidth, requestedRight));
  let sourceBottom = Math.max(sourceTop + 1, Math.min(sourceHeight, requestedBottom));

  let extractWidth = sourceRight - sourceLeft;
  let extractHeight = sourceBottom - sourceTop;
  const targetLeft = Math.max(0, -requestedLeft);
  const targetTop = Math.max(0, -requestedTop);

  // 캔버스 밖으로 넘어가는 부분은 잘라낸다.
  extractWidth = Math.max(1, Math.min(extractWidth, outputWidth - targetLeft));
  extractHeight = Math.max(1, Math.min(extractHeight, outputHeight - targetTop));

  // target이 이미 캔버스 밖이면 빈 캔버스만 반환한다.
  if (targetLeft >= outputWidth || targetTop >= outputHeight) {
    return sharp({
      create: {
        width: outputWidth,
        height: outputHeight,
        channels: 4,
        background: { r: 1, g: 8, b: 18, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
  }

  const extracted = await sharp(imageBuffer)
    .rotate()
    .extract({
      left: sourceLeft,
      top: sourceTop,
      width: extractWidth,
      height: extractHeight,
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: outputWidth,
      height: outputHeight,
      channels: 4,
      background: { r: 1, g: 8, b: 18, alpha: 1 },
    },
  })
    .composite([{ input: extracted, left: targetLeft, top: targetTop }])
    .png()
    .toBuffer();
}

async function normalizeScoreboardImage(
  imageBuffer: Buffer,
  log: (message: string, extra?: unknown) => void,
) {
  const original = sharp(imageBuffer).rotate();
  const metadata = await original.metadata();
  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;

  if (!originalWidth || !originalHeight) {
    throw new Error("이미지 크기를 읽지 못했습니다.");
  }

  const resultTitleTop = await detectResultTitleTop(
    imageBuffer,
    originalWidth,
    originalHeight,
  );
  const teamHeaderAnchors = await detectTeamHeaderAnchors(
    imageBuffer,
    originalWidth,
    originalHeight,
  );

  // 핵심: 원본을 비율 리사이즈하지 않는다.
  // 1번 팀 헤더가 표준 y=157에 오도록 세로만 맞춰 1048x622 창으로 잘라낸다.
  // 이렇게 해야 캡쳐 폭이 다르거나 오른쪽이 조금 잘려도 KDA x좌표가 불필요하게 늘어나지 않는다.
  const anchorY =
    typeof teamHeaderAnchors.topTeamHeaderY === "number"
      ? teamHeaderAnchors.topTeamHeaderY
      : typeof resultTitleTop === "number"
        ? resultTitleTop +
          (NORMALIZED_TOP_TEAM_HEADER_Y - NORMALIZED_RESULT_TITLE_Y)
        : Math.round(originalHeight * 0.253);

  const cropTop = Math.round(anchorY - NORMALIZED_TOP_TEAM_HEADER_Y);
  const cropLeft = 0;

  const normalizedBuffer = await extractRectWithPadding(
    imageBuffer,
    {
      left: cropLeft,
      top: cropTop,
      width: NORMALIZED_SCOREBOARD_WIDTH,
      height: NORMALIZED_SCOREBOARD_HEIGHT,
    },
    NORMALIZED_SCOREBOARD_WIDTH,
    NORMALIZED_SCOREBOARD_HEIGHT,
  );

  log("점수판 정규화 완료", {
    originalWidth,
    originalHeight,
    resultTitleTop,
    originalTopTeamHeaderY: teamHeaderAnchors.topTeamHeaderY,
    originalBottomTeamHeaderY: teamHeaderAnchors.bottomTeamHeaderY,
    cropLeft,
    cropTop,
    normalizedWidth: NORMALIZED_SCOREBOARD_WIDTH,
    normalizedHeight: NORMALIZED_SCOREBOARD_HEIGHT,
  });

  return normalizedBuffer;
}

function getRowCenters(
  imageWidth: number,
  imageHeight: number,
  anchors?: {
    resultTitleTop?: number | null;
    topTeamHeaderY?: number | null;
    bottomTeamHeaderY?: number | null;
  },
) {
  const fullClientCapture = imageHeight / imageWidth > 0.56;
  const rowGap = imageHeight * (fullClientCapture ? 0.0578 : 0.0555);

  const fallbackTopStart = imageHeight * (fullClientCapture ? 0.303 : 0.306);

  // 팀 헤더 텍스트 중심에서 첫 번째 선수 행 중심까지의 실제 간격은 약 0.052H다.
  // 하단은 TOP 5행 이후 팀 간 간격까지 포함해 약 0.071H를 더해야 맞는다.
  const topStart =
    typeof anchors?.topTeamHeaderY === "number"
      ? anchors.topTeamHeaderY + imageHeight * 0.052
      : fallbackTopStart;

  const estimatedBottomStart = topStart + rowGap * 5 + imageHeight * 0.071;
  const detectedBottomStart =
    typeof anchors?.bottomTeamHeaderY === "number"
      ? anchors.bottomTeamHeaderY + imageHeight * 0.052
      : null;

  const minBottomStart = topStart + rowGap * 5 + imageHeight * 0.045;
  const maxBottomStart = topStart + rowGap * 5 + imageHeight * 0.095;
  const bottomStart =
    detectedBottomStart !== null &&
    detectedBottomStart >= minBottomStart &&
    detectedBottomStart <= maxBottomStart
      ? detectedBottomStart
      : estimatedBottomStart;

  return [
    ...Array.from({ length: 5 }, (_, index) => ({
      side: "TOP" as const,
      rowIndex: index,
      centerY: topStart + rowGap * index,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      side: "BOTTOM" as const,
      rowIndex: index,
      centerY: bottomStart + rowGap * index,
    })),
  ];
}

function getGeometry(imageWidth: number, imageHeight: number, centerY: number) {
  const rowHeight = Math.max(26, Math.round(imageHeight * 0.041));
  const championSize = Math.max(34, Math.round(imageWidth * 0.0345));

  return {
    // 소환사 주문/레벨 뒤 원형 챔피언 초상화 영역.
    champion: {
      left: imageWidth * 0.096,
      top: centerY - championSize / 2,
      width: championSize,
      height: championSize,
    },
    // 닉네임 영역. 아이템 아이콘이 섞이지 않도록 오른쪽 폭을 줄인다.
    playerName: {
      left: imageWidth * 0.132,
      top: centerY - rowHeight / 2,
      width: imageWidth * 0.145,
      height: rowHeight,
    },
    // KDA 영역. 이전 좌표는 킬을 놓치고 CS까지 포함하는 문제가 있어 왼쪽으로 이동하고 폭을 축소.
    kda: {
      left: imageWidth * 0.492,
      top: centerY - rowHeight / 2,
      width: imageWidth * 0.128,
      height: rowHeight,
    },
  } satisfies Record<string, Rect>;
}

function debugSvgOverlay(
  imageWidth: number,
  imageHeight: number,
  rects: Array<{ label: string; rect: Rect }>,
) {
  const colors = ["#38bdf8", "#facc15", "#fb7185"];
  const items = rects
    .map(({ label, rect }, index) => {
      const color = colors[index % colors.length];
      const safe = clampRect(rect, imageWidth, imageHeight);
      return `<rect x="${safe.left}" y="${safe.top}" width="${safe.width}" height="${safe.height}" fill="none" stroke="${color}" stroke-width="2"/><text x="${safe.left}" y="${Math.max(12, safe.top - 3)}" fill="${color}" font-size="12" font-family="Arial">${label}</text>`;
    })
    .join("");

  return Buffer.from(
    `<svg width="${imageWidth}" height="${imageHeight}" xmlns="http://www.w3.org/2000/svg">${items}</svg>`,
  );
}

async function saveDebugImage(filePath: string, buffer: Buffer) {
  try {
    await writeFile(filePath, buffer);
  } catch (error) {
    console.error("[LOL_RESULT_DEBUG_SAVE_ERROR]", filePath, error);
  }
}

async function findChampionCandidates(
  iconBuffer: Buffer,
  championImages: ChampionImage[],
) {
  if (championImages.length === 0) {
    return {
      championName: null,
      confidence: 0,
      candidates: [] as Array<{ championName: string; confidence: number }>,
    };
  }

  const capturedSignature = await makeChampionSignature(iconBuffer);
  const candidates = championImages
    .map((champion) => ({
      championName: champion.name,
      confidence: compareChampionSignatures(capturedSignature, champion),
    }))
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 8)
    .map((candidate) => ({
      championName: candidate.championName,
      confidence: Number(candidate.confidence.toFixed(4)),
    }));

  const best = candidates[0] ?? { championName: null, confidence: 0 };

  return {
    championName: best.championName,
    confidence: best.confidence,
    candidates,
  };
}

async function preprocessForOcr(buffer: Buffer) {
  return sharp(buffer)
    .grayscale()
    .normalize()
    .resize({ width: 420, withoutEnlargement: false })
    .png()
    .toBuffer();
}

export async function POST(req: Request) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  const requestId = Math.random().toString(36).slice(2, 8);
  const log = (message: string, extra?: unknown) => {
    if (extra === undefined) {
      console.log(`[LOL_RESULT_IMPORT:${requestId}] ${message}`);
      return;
    }

    console.log(`[LOL_RESULT_IMPORT:${requestId}] ${message}`, extra);
  };

  try {
    log("요청 수신");
    const formData = await req.formData();
    const file = formData.get("image");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { message: "롤 결과 캡쳐 이미지를 업로드해주세요." },
        { status: 400 },
      );
    }

    const originalImageBuffer = Buffer.from(await file.arrayBuffer());
    log("이미지 버퍼 로드", { bytes: originalImageBuffer.length });

    const imageBuffer = await normalizeScoreboardImage(
      originalImageBuffer,
      log,
    );
    const baseImage = sharp(imageBuffer).rotate();
    const metadata = await baseImage.metadata();
    const imageWidth = metadata.width ?? 0;
    const imageHeight = metadata.height ?? 0;

    log("이미지 메타데이터 확인", { imageWidth, imageHeight });

    if (!imageWidth || !imageHeight) {
      return NextResponse.json(
        { message: "이미지 크기를 읽지 못했습니다." },
        { status: 400 },
      );
    }

    // 챔피언 자동 인식은 오답률이 높아 실사용에서는 비활성화한다.
    // 캡쳐에서 잘라낸 챔피언 아이콘만 프론트에 전달하고, 챔피언명은 관리자가 직접 입력한다.

    const rows: LolResultImportRow[] = [];
    const resultTitleTop = await detectResultTitleTop(
      imageBuffer,
      imageWidth,
      imageHeight,
    );
    const teamHeaderAnchors = await detectTeamHeaderAnchors(
      imageBuffer,
      imageWidth,
      imageHeight,
    );
    log("승패/팀 헤더 앵커 확인", { resultTitleTop, ...teamHeaderAnchors });
    const rowCenters = getRowCenters(imageWidth, imageHeight, {
      resultTitleTop,
      topTeamHeaderY: teamHeaderAnchors.topTeamHeaderY,
      bottomTeamHeaderY: teamHeaderAnchors.bottomTeamHeaderY,
    });
    const debugRoot =
      process.env.VERCEL === "1"
        ? path.join("/tmp", ".lol-result-debug")
        : path.join(process.cwd(), ".lol-result-debug");
    const debugDir = path.join(debugRoot, requestId);

    try {
      await mkdir(debugDir, { recursive: true });
      log("디버그 이미지 저장 폴더", { debugDir });
    } catch (error) {
      console.error("[LOL_RESULT_DEBUG_MKDIR_ERROR]", debugDir, error);
    }
    await Promise.all([
      saveDebugImage(path.join(debugDir, "original.png"), originalImageBuffer),
      saveDebugImage(path.join(debugDir, "normalized.png"), imageBuffer),
    ]);

    const resultHeaderBuffer = await cropBuffer(
      baseImage,
      {
        left: imageWidth * 0.055,
        top: imageHeight * 0.012,
        width: imageWidth * 0.16,
        height: imageHeight * 0.075,
      },
      imageWidth,
      imageHeight,
    );
    log("승패 텍스트 OCR 시작");
    const resultText = await recognizeText(
      await preprocessForOcr(resultHeaderBuffer),
      "kor+eng",
    );
    log("승패 텍스트 OCR 완료", { resultText });

    const debugRects: Array<{ label: string; rect: Rect }> = [];

    for (const row of rowCenters) {
      log(`행 분석 시작: ${row.side} ${row.rowIndex + 1}/5`);
      const geometry = getGeometry(imageWidth, imageHeight, row.centerY);
      const [nameBuffer, kdaBuffer, championBuffer] = await Promise.all([
        cropBuffer(baseImage, geometry.playerName, imageWidth, imageHeight),
        cropBuffer(baseImage, geometry.kda, imageWidth, imageHeight),
        cropBuffer(baseImage, geometry.champion, imageWidth, imageHeight),
      ]);

      const rowLabel = `${row.side.toLowerCase()}-${row.rowIndex + 1}`;
      debugRects.push(
        { label: `${rowLabel}-champion`, rect: geometry.champion },
        { label: `${rowLabel}-name`, rect: geometry.playerName },
        { label: `${rowLabel}-kda`, rect: geometry.kda },
      );
      await Promise.all([
        saveDebugImage(
          path.join(debugDir, `${rowLabel}-champion.png`),
          championBuffer,
        ),
        saveDebugImage(path.join(debugDir, `${rowLabel}-name.png`), nameBuffer),
        saveDebugImage(path.join(debugDir, `${rowLabel}-kda.png`), kdaBuffer),
      ]);

      const championPreviewDataUrl = `data:image/png;base64,${championBuffer.toString("base64")}`;

      const [playerName, kdaResult] = await Promise.all([
        recognizePlayerName(nameBuffer),
        recognizeKda(kdaBuffer),
      ]);

      const kdaText = kdaResult.text;
      const kda = kdaResult.kda;
      const warnings: string[] = [];

      if (!playerName) warnings.push("플레이어 닉네임 인식 실패");
      if (kda.kills === null || kda.deaths === null || kda.assists === null) {
        warnings.push("KDA 인식 실패");
      }

      log(`행 분석 완료: ${row.side} ${row.rowIndex + 1}/5`, {
        playerName,
        kdaText,
        championName: null,
        championConfidence: 0,
        championCandidates: [],
      });

      rows.push({
        side: row.side,
        rowIndex: row.rowIndex,
        playerName,
        championName: null,
        championConfidence: 0,
        championCandidates: [],
        championPreviewDataUrl,
        kills: kda.kills,
        deaths: kda.deaths,
        assists: kda.assists,
        kdaText,
        warnings,
      });
    }

    const overlayBuffer = await baseImage
      .clone()
      .composite([
        {
          input: debugSvgOverlay(imageWidth, imageHeight, debugRects),
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toBuffer();
    await saveDebugImage(path.join(debugDir, "overlay.png"), overlayBuffer);

    const response: LolResultImportResponse = {
      resultText,
      topPlayerName: rows[0]?.playerName ?? "",
      rows,
      warnings: ["KDA 자동 인식 결과는 저장 전 반드시 확인해주세요."],
    };

    log("응답 반환", { rows: rows.length });
    return NextResponse.json(response);
  } catch (error) {
    console.error("[LOL_RESULT_IMPORT_POST_ERROR]", error);

    return NextResponse.json(
      { message: "롤 결과 캡쳐 분석 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
