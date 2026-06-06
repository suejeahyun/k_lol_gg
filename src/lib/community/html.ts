const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "s", "u", "blockquote", "hr",
  "ul", "ol", "li", "code", "pre", "a", "h1", "h2", "h3",
]);

function sanitizeAttributes(tag: string, attrs: string) {
  if (tag !== "a") return "";
  const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
  const href = hrefMatch?.[1]?.trim();
  if (!href || !/^https?:\/\//i.test(href)) return "";
  const safeHref = href.replace(/"/g, "&quot;");
  return ` href="${safeHref}" target="_blank" rel="noopener noreferrer"`;
}

export function sanitizeCommunityHtml(input: string) {
  const withoutDangerousBlocks = String(input ?? "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/on[a-z]+\s*=\s*["'][\s\S]*?["']/gi, "")
    .replace(/javascript:/gi, "");

  return withoutDangerousBlocks.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (match, rawTag, attrs = "") => {
    const tag = String(rawTag).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    const closing = match.startsWith("</");
    if (closing) return `</${tag}>`;
    if (tag === "br" || tag === "hr") return `<${tag}>`;
    return `<${tag}${sanitizeAttributes(tag, attrs)}>`;
  });
}

export function parseCommunityTags(raw: unknown) {
  const source = Array.isArray(raw) ? raw.join(" ") : String(raw ?? "");
  return Array.from(
    new Set(
      source
        .split(/[\s,]+/)
        .map((tag) => tag.trim().replace(/^#+/, ""))
        .filter(Boolean)
        .map((tag) => tag.slice(0, 24)),
    ),
  ).slice(0, 10);
}
