import { SERVICE_BRAND } from "@/lib/service-brand";

function literalPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export const KAKAO_SERVICE_NAME_PATTERN = literalPattern(SERVICE_BRAND.name);
export const KAKAO_SERVICE_SHORT_NAME_PATTERN = literalPattern(SERVICE_BRAND.shortName);
export const KAKAO_INHOUSE_FORM_HEADER = new RegExp(String.raw`^\s*\[${KAKAO_SERVICE_NAME_PATTERN} 내전 구인 양식\]\s*$`, "mu");
export const KAKAO_SCRIM_FORM_HEADER = new RegExp(String.raw`^\s*\[${SERVICE_BRAND.id === "nexus" ? KAKAO_SERVICE_NAME_PATTERN : "K-?LOL\\.GG"}\s*(?:멸망전\s*)?스크림\s*(?:구인\s*양식|상세)\]`, "u");

/** Branded copied forms belong to one community; do not rewrite signed input. */
export function hasForeignKakaoServiceHeader(text: string): boolean {
  const headers = text.normalize("NFKC").matchAll(/^\s*\/?\[?\s*(K-?LOL\.GG|NEXUS\.GG)(?=\s+(?:구인|내전|스크림|파티|운영|멸망전))/gimu);
  return [...headers].some((header) => header[1]!.toUpperCase().replace(/^KLOL/u, "K-LOL") !== SERVICE_BRAND.name);
}
