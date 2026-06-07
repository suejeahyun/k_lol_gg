export function normalizeLolName(value: string) {
  return value
    .replace(/\([^)]*\)/g, "")
    .replace(/#[A-Za-z0-9가-힣_-]+/g, "")
    .replace(/\.\.\.|…/g, "")
    .replace(/[\s\u200B\u200C\u200D]/g, "")
    .replace(/[\[\]{}()<>"]|['`~!@#$%^&*_=+|\\:;,.?/\-]/g, "")
    .replace(/[£¥₩]/g, "")
    .replace(/[0-9]+$/g, "")
    .toLowerCase()
    .trim();
}

export function extractRiotNameFromPlayerLabel(value: string) {
  const match = value.match(/\(([^)]*)\)/);
  const raw = match?.[1] ?? value;
  return raw.replace(/#[^#\s)]+$/g, "").trim();
}

function levenshteinSimilarity(a: string, b: string) {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 0;

  const dp = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );

  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return 1 - dp[a.length][b.length] / maxLength;
}

function bestSubstringSimilarity(shorter: string, longer: string) {
  if (!shorter || !longer) return 0;
  if (shorter.length > longer.length) return bestSubstringSimilarity(longer, shorter);
  if (longer.includes(shorter)) return shorter.length / longer.length;

  let best = 0;
  for (let start = 0; start <= longer.length - Math.max(1, shorter.length - 1); start += 1) {
    for (const size of [shorter.length, shorter.length + 1, shorter.length - 1]) {
      if (size <= 0) continue;
      const part = longer.slice(start, start + size);
      if (!part) continue;
      best = Math.max(best, levenshteinSimilarity(shorter, part));
    }
  }
  return best * Math.min(1, shorter.length / Math.max(1, longer.length));
}

export function nicknameSimilarity(left: string, right: string) {
  const a = normalizeLolName(left);
  const b = normalizeLolName(right);

  if (!a || !b) return 0;
  if (a === b) return 1;

  const containsScore = a.includes(b) || b.includes(a)
    ? Math.min(a.length, b.length) / Math.max(a.length, b.length)
    : 0;

  const substringScore = bestSubstringSimilarity(a, b);
  const editScore = levenshteinSimilarity(a, b);

  // OCR이 앞/뒤에 쓸데없는 영문·기호를 붙이는 경우가 많아서
  // 현재 세트 10명 안에서는 부분 유사도를 조금 더 높게 평가한다.
  return Math.max(containsScore, substringScore, editScore * 0.92);
}


export function buildLolNameAliases(value: string) {
  const aliases = new Set<string>();
  const push = (raw: string | null | undefined) => {
    if (!raw) return;
    const cleaned = raw.trim();
    if (!cleaned) return;
    aliases.add(cleaned);
    aliases.add(cleaned.replace(/#[^#\s)]+$/g, "").trim());
  };

  push(value);

  const parenthesized = Array.from(value.matchAll(/\(([^)]*)\)/g)).map((match) => match[1]);
  parenthesized.forEach(push);

  const withoutParen = value.replace(/\([^)]*\)/g, " ");
  push(withoutParen);

  value
    .split(/[\s/·,]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .forEach(push);

  parenthesized
    .join(" ")
    .split(/[\s/·,]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .forEach(push);

  return Array.from(aliases).filter(Boolean);
}

export function participantNameSimilarity(ocrName: string, participantLabel: string) {
  const ocr = normalizeLolName(ocrName);
  if (!ocr) return 0;

  const aliases = buildLolNameAliases(participantLabel);
  let best = 0;

  for (const alias of aliases) {
    const normalizedAlias = normalizeLolName(alias);
    if (!normalizedAlias) continue;

    if (ocr === normalizedAlias) return 1;

    if (ocr.includes(normalizedAlias)) {
      best = Math.max(best, Math.min(0.98, normalizedAlias.length / Math.max(1, ocr.length) + 0.22));
    }

    if (normalizedAlias.includes(ocr)) {
      best = Math.max(best, Math.min(0.96, ocr.length / Math.max(1, normalizedAlias.length) + 0.18));
    }

    best = Math.max(best, nicknameSimilarity(ocrName, alias));
  }

  return best;
}
