export function cleanStoredSubstituteName(value: string) {
  let name = String(value || "").trim();
  if (/^\d+\s*명$/.test(name)) return "";

  let previous = "";
  while (name && name !== previous) {
    previous = name;
    name = name.replace(/^\d+\s*[.)]\s*/, "").trim();
  }

  return /^\d+\s*명$/.test(name) ? "" : name;
}
