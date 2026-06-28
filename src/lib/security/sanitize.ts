const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const DANGEROUS_TAGS = /<\/?\s*(script|iframe|object|embed|link|meta|style|base|form)[^>]*>/gi;
const DANGEROUS_ATTRS = /\s(on\w+|srcdoc)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URLS = /(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi;

export function stripDangerousHtml(value: string) {
  return value
    .replace(CONTROL_CHARACTERS, "")
    .replace(DANGEROUS_TAGS, "")
    .replace(DANGEROUS_ATTRS, "")
    .replace(JS_URLS, "$1=\"#\"");
}

export function sanitizePlainText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return "";
  return stripDangerousHtml(value).trim().slice(0, maxLength);
}

export function sanitizeObjectText<T>(value: T, maxLength = 1000): T {
  if (typeof value === "string") return sanitizePlainText(value, maxLength) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeObjectText(item, maxLength)) as T;
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = sanitizeObjectText(item, maxLength);
    }
    return output as T;
  }
  return value;
}
